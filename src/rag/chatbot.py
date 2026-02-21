"""
RAG-powered chatbot using Claude Sonnet 4 and Actian VectorAI DB.
"""

import anthropic
from .retriever import retrieve

# Initialize Anthropic client (reads ANTHROPIC_API_KEY from environment)
client = anthropic.Anthropic()

SYSTEM_PROMPT = """You are an Atlanta business location advisor. Give SHORT, concise answers.

FORMAT:
• Use bullet points
• Maximum 3-4 bullets per response
• Each bullet: 1 short sentence
• Recommend 1-2 neighborhoods max
• ALWAYS include a dedicated parking bullet with SPECIFIC NUMBERS

PARKING DATA REQUIRED:
• Every response MUST have one bullet with exact parking counts
• Use format: "🅿️ 850 parking spaces across 12 lots"
• Include occupancy rates if available
• Never say "ample" or "good" - give actual numbers

STYLE:
• Direct and actionable
• No long explanations
• Focus on key facts only

Example good response:
• **Midtown** - High foot traffic, office workers need caffeine
• Strong coffee culture and 22 existing cafes
• 🅿️ 850 parking spaces across 12 lots (68% occupancy)"""


def generate_response(user_message: str, conversation_history: list = None) -> str:
    """
    Generate chatbot response using RAG.

    Args:
        user_message: User's current message
        conversation_history: List of prior messages [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        Assistant's response
    """
    # Retrieve relevant context
    context_docs = retrieve(user_message, top_k=5)
    context = "\n\n".join([f"[Context {i+1}]\n{doc}" for i, doc in enumerate(context_docs)])

    # Build messages
    messages = []

    # Add conversation history if provided
    if conversation_history:
        messages.extend(conversation_history)

    # Add current message with context
    user_content = f"""Context from ParkSight knowledge base:

{context}

---

User question: {user_message}"""

    messages.append({
        "role": "user",
        "content": user_content
    })

    # Call Claude
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        system=SYSTEM_PROMPT,
        messages=messages
    )

    return response.content[0].text


def quick_response(user_message: str) -> str:
    """
    Generate a quick response without conversation history.
    Useful for stateless API calls.
    """
    return generate_response(user_message, conversation_history=None)
