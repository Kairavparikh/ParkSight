"""
Flask API server for ParkSight RAG chatbot.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from .chatbot import generate_response
from .retriever import health_check

app = Flask(__name__)
CORS(app)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    vector_db_ok = health_check()
    return jsonify({
        "status": "ok" if vector_db_ok else "degraded",
        "vector_db": "connected" if vector_db_ok else "disconnected"
    }), 200 if vector_db_ok else 503


@app.route('/chat', methods=['POST'])
def chat():
    """
    Chat endpoint for business advisor.

    Request body:
    {
        "message": "Where should I open a coffee shop?",
        "history": [  // optional
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ]
    }

    Response:
    {
        "response": "Based on parking and neighborhood data, I recommend..."
    }
    """
    try:
        data = request.get_json()

        if not data or 'message' not in data:
            return jsonify({"error": "Missing 'message' field"}), 400

        user_message = data['message']

        if not user_message.strip():
            return jsonify({"error": "Empty message"}), 400

        # Get conversation history if provided
        conversation_history = data.get('history', [])

        # Generate response with history
        response_text = generate_response(user_message, conversation_history)

        return jsonify({"response": response_text}), 200

    except Exception as e:
        print(f"Error in /chat: {e}")
        return jsonify({"error": "Internal server error"}), 500


def run_server(host='0.0.0.0', port=5001, debug=False):
    """Run the Flask server."""
    print(f"Starting ParkSight RAG API on {host}:{port}")
    app.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    run_server(debug=True)
