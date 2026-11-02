import os
import json
import time
import traceback
import requests
from flask import Flask, send_from_directory, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')

DB_FILE = 'database.json'

def load_db():
    if not os.path.exists(DB_FILE):
        return {
            "study_records": {"user": {"nickname": "열공러", "totalSeconds": 0, "goalSeconds": 10800}},
            "board_posts": []
        }
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    db = load_db()
    return jsonify(db)

@app.route('/api/data', methods=['POST'])
def update_data():
    req = request.json or {}
    db = load_db()
    if 'study_records' in req:
        db['study_records'] = req['study_records']
    if 'board_posts' in req:
        db['board_posts'] = req['board_posts']
    save_db(db)
    return jsonify({"status": "success"})

def get_precise_error_message(status_code, error_text=""):
    if status_code in [401, 403]:
        return f"유효하지 않거나 권한이 없는 API 키입니다 (인증 오류 코드: {status_code}). 올바른 Gemini API 키를 입력해주세요."
    elif status_code == 429:
        return f"API 토큰 소진 또는 사용량 한도(Quota)가 초과되었습니다 (오류 코드: {status_code}). 잠시 후 다시 시도하거나 다른 API 키를 사용하세요."
    elif status_code == 503:
        return f"외부 AI 서버 서비스가 일시 중단되었습니다 (오류 코드: {status_code})."
    elif status_code == 504:
        return f"AI 서버 응답 시간 초과 (오류 코드: {status_code}). 요청이 지연되었습니다."
    elif status_code == 400:
        return f"잘못된 요청 또는 형식 오류 (오류 코드: {status_code})."
    else:
        return f"AI 서버 통신 실패 또는 응답 지연 (오류 코드: {status_code})"

@app.route('/api/verify-key', methods=['POST'])
def verify_api_key():
    print(f"\n[DEBUG] /api/verify-key request received from {request.remote_addr}")
    try:
        req = request.get_json(silent=True) or {}
        api_key = req.get('apiKey', '').strip()
        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if not api_key:
            return jsonify({"valid": False, "error": "API 키가 입력되지 않았습니다."}), 400

        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": api_key
        }
        payload = {
            "contents": [{
                "parts": [{"text": "Hello"}]
            }]
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 200:
            return jsonify({"valid": True, "message": "✅ 유효한 API 키입니다! (정상 확인됨)"})
        else:
            status = resp.status_code
            precise_msg = get_precise_error_message(status, resp.text)
            return jsonify({"valid": False, "error_code": status, "error": precise_msg, "details": resp.text}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"valid": False, "error": "API 키 검증 중 통신 오류 발생", "details": str(e)}), 400

@app.route('/api/chat', methods=['POST'])
def chat_with_ai():
    print(f"\n[DEBUG] /api/chat request received from {request.remote_addr}")
    try:
        req = request.get_json(silent=True) or {}
        question = req.get('question', '').strip()
        api_key = req.get('apiKey', '').strip()
        
        print(f"[DEBUG] Question received: {question}")
        print(f"[DEBUG] API Key received length: {len(api_key)}")

        if not question:
            print("[DEBUG] Question is missing or empty.")
            return jsonify({"error": "질문(question)이 누락되었거나 비어 있습니다.", "error_code": 400, "details": "빈 질문은 처리할 수 없습니다."}), 400

        if not api_key:
            api_key = os.getenv("GEMINI_API_KEY", "").strip()

        if not api_key:
            print("[DEBUG] API Key is missing or empty.")
            return jsonify({"error": "API 키(apiKey)가 누락되었습니다.", "error_code": 400, "details": "Gemini API 키를 입력해주세요."}), 400

        system_prompt = """
        당신은 'Campus Cody'라는 이름의 학습 도우미입니다. 
        공부 방법, 시간 관리, 스터디 타이머 사용법에 관한 질문에만 친절하게 답변하십시오. 
        만약 공부나 타이머와 상관없는 질문(예: 음식 추천, 연예인 뉴스, 일반적인 잡담 등)을 받으면, 
        '죄송합니다. 저는 학습과 타이머에 관련된 도움만 드릴 수 있습니다. 공부에 관한 다른 궁금한 점이 있으신가요?'라고 정중히 거절하십시오. 
        답변은 한국어로 하세요.
        """

        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
        headers = {
            "Content-Type": "application/json",
            "X-goog-api-key": api_key
        }
        
        full_text = f"{system_prompt}\n\n사용자 질문: {question}"
        payload = {
            "contents": [{
                "parts": [{"text": full_text}]
            }]
        }

        # 지수 백오프(Exponential Backoff) 재시도 로직 (최대 3회, 타임아웃 25초)
        max_retries = 3
        backoff_delays = [2, 4, 8]
        last_status_code = 500
        last_error_text = "Unknown error"

        for attempt in range(max_retries):
            try:
                print(f"[DEBUG] [Attempt {attempt + 1}/{max_retries}] Calling Gemini API at {url}...")
                resp = requests.post(url, headers=headers, json=payload, timeout=25)
                last_status_code = resp.status_code
                print(f"[DEBUG] [Attempt {attempt + 1}] Gemini REST response status: {last_status_code}")

                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get('candidates', [])
                    if candidates:
                        parts = candidates[0].get('content', {}).get('parts', [])
                        if parts and 'text' in parts[0]:
                            answer_text = parts[0]['text']
                            print(f"[DEBUG] Gemini API success! Answer length: {len(answer_text)}")
                            return jsonify({"answer": answer_text})
                    print(f"[DEBUG] Gemini API returned 200 but no valid candidates/parts: {resp.text}")
                else:
                    print(f"[DEBUG] Gemini API error status {last_status_code}: {resp.text}")
                    last_error_text = resp.text

            except requests.exceptions.Timeout as timeout_err:
                last_status_code = 504
                last_error_text = str(timeout_err)
                print(f"[DEBUG] [Attempt {attempt + 1}] Timeout encountered: {timeout_err}")
            except requests.exceptions.ConnectionError as conn_err:
                last_status_code = 503
                last_error_text = str(conn_err)
                print(f"[DEBUG] [Attempt {attempt + 1}] ConnectionError encountered: {conn_err}")
            except requests.exceptions.RequestException as req_err:
                last_status_code = 500
                last_error_text = str(req_err)
                print(f"[DEBUG] [Attempt {attempt + 1}] RequestException encountered: {req_err}")
            except Exception as inner_err:
                last_status_code = 500
                last_error_text = str(inner_err)
                print(f"[DEBUG] [Attempt {attempt + 1}] Unexpected inner exception: {inner_err}")

            if attempt < max_retries - 1:
                sleep_time = backoff_delays[attempt]
                print(f"[DEBUG] Waiting {sleep_time} seconds before retry...")
                time.sleep(sleep_time)

        print(f"[DEBUG] All retry attempts failed for Gemini API. Last status code: {last_status_code}")
        precise_error = get_precise_error_message(last_status_code, last_error_text)
        return jsonify({
            "error": precise_error,
            "error_code": last_status_code,
            "details": f"최대 재시도 횟수 초과 (상태 코드: {last_status_code}, 원인: {last_error_text})"
        }), 500

    except Exception as e:
        print(f"[DEBUG] Exception in chat_with_ai: {e}")
        traceback.print_exc()
        return jsonify({
            "error": "AI 서버 통신 실패 또는 응답 지연",
            "error_code": 500,
            "details": str(e)
        }), 500

if __name__ == '__main__':
    print("🎓 캠퍼스 스터디 타이머 백엔드 서버가 실행되었습니다.")
    app.run(host='0.0.0.0', port=5000, debug=True)
