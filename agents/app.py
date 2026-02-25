"""
Fiat-Lux Agent Service
Flask API for AI-powered data analysis agents — powered by fiat-lux-agents.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from fiat_lux_agents import FilterBot, FilterEngine, DocumentBot, KnowledgeBot

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:3001"])

# Initialise bots (lazy for those needing API key)
filter_bot = FilterBot()
_document_bot: DocumentBot = None


def _get_document_bot() -> DocumentBot:
    global _document_bot
    if _document_bot is None:
        _document_bot = DocumentBot()
    return _document_bot


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'fiat-lux-agents',
        'version': '0.2.0',
        'bots': ['FilterBot', 'DocumentBot'],
    })


# ---------------------------------------------------------------------------
# Filter agent (unchanged)
# ---------------------------------------------------------------------------

@app.route('/api/agents/filter', methods=['POST'])
def filter_agent():
    """FilterBot — natural language filtering."""
    try:
        data            = request.get_json()
        action          = data.get('action', 'add')
        user_query      = data.get('message', '')
        file_data       = data.get('data', [])
        existing_filters = data.get('filters', [])

        if action == 'interpret':
            filter_spec = filter_bot.interpret_filter(user_query, existing_filters)
            is_valid, error_msg = filter_bot.validate_filter(filter_spec)
            return jsonify({
                'success': is_valid,
                'filter': filter_spec,
                'error': error_msg if not is_valid else None,
            })

        elif action == 'apply':
            filter_spec = filter_bot.interpret_filter(user_query, existing_filters)
            is_valid, error_msg = filter_bot.validate_filter(filter_spec)
            if not is_valid:
                return jsonify({'success': False, 'error': error_msg}), 400

            engine = FilterEngine(file_data)
            for f in existing_filters:
                engine.add_filter(f)
            filtered_data, message = engine.add_filter(filter_spec)
            return jsonify({
                'success': True,
                'data': filtered_data,
                'filter': filter_spec,
                'message': message,
                'count': len(filtered_data),
                'total': len(file_data),
            })

        elif action == 'remove':
            filter_id = data.get('filterId')
            if not filter_id:
                return jsonify({'success': False, 'error': 'filterId required'}), 400
            engine = FilterEngine(file_data)
            for f in existing_filters:
                if f.get('id') != filter_id:
                    engine.add_filter(f)
            return jsonify({
                'success': True,
                'data': engine._apply_filters(),
                'count': len(engine._apply_filters()),
                'total': len(file_data),
            })

        elif action == 'clear':
            return jsonify({'success': True, 'data': file_data,
                            'count': len(file_data), 'total': len(file_data)})

        elif action == 'list':
            return jsonify({'success': True, 'filters': existing_filters})

        else:
            return jsonify({'success': False, 'error': f'Unknown action: {action}'}), 400

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Visualize agent — DocumentBot
# ---------------------------------------------------------------------------

@app.route('/api/agents/visualize', methods=['POST'])
def visualize_agent():
    """DocumentBot — generate or refine an HTML visualization from document text."""
    try:
        data          = request.get_json()
        user_request  = (data.get('request') or data.get('message') or '').strip()
        current_html  = data.get('current_html')
        template_html = data.get('template_html')
        template_name = data.get('template_name')
        refine_only   = data.get('refine', False)

        # document_text can be a string or list of strings
        document_text = data.get('document_text') or data.get('content')

        if not user_request:
            return jsonify({'success': False, 'error': 'request is required'}), 400

        bot = _get_document_bot()

        if refine_only and current_html:
            result = bot.refine(current_html, user_request)
        else:
            if not document_text:
                return jsonify({'success': False, 'error': 'document_text is required'}), 400
            result = bot.process(
                document_text,
                request=user_request,
                current_html=current_html,
                template_html=template_html,
                template_name=template_name,
            )

        return jsonify({
            'success': True,
            'message': result['message'],
            'visualization': result['html'],
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# CSV export agent — extract table data from HTML as CSV
# ---------------------------------------------------------------------------

_CSV_KNOWLEDGE = """You are a data extraction expert. Given an HTML visualization,
extract the specified table or data as CSV format.

RULES:
1. Output ONLY the CSV data — no explanation, no markdown, no code blocks
2. First row must be column headers
3. Use comma as delimiter
4. Every row MUST have the same number of columns as the header row
5. If a cell is empty/missing, leave it empty but maintain column position (,,)
6. For monetary values like "$23,759" — remove the comma (output as $23759 or 23759)
7. Wrap in double quotes any value that contains a comma
8. If the user specifies which table to export, extract only that
9. If multiple tables exist and user doesn't specify, extract the main data table
10. Keep numbers clean for spreadsheet use (no thousand separators)"""

_csv_bot: KnowledgeBot = None


def _get_csv_bot() -> KnowledgeBot:
    global _csv_bot
    if _csv_bot is None:
        _csv_bot = KnowledgeBot(knowledge=_CSV_KNOWLEDGE, max_tokens=8192)
    return _csv_bot


@app.route('/api/agents/csv', methods=['POST'])
def csv_agent():
    """KnowledgeBot — extract CSV from an HTML visualization."""
    try:
        data             = request.get_json()
        user_request     = (data.get('request') or data.get('message') or '').strip()
        current_html     = data.get('current_html') or data.get('visualization', '')

        if not current_html:
            return jsonify({'success': False, 'error': 'current_html is required'}), 400

        bot = _get_csv_bot()
        csv_text = bot.answer(
            f"User request: {user_request}\n\nVisualization HTML:\n{current_html}"
        )

        # Strip any accidental markdown fences
        csv_text = csv_text.strip()
        if csv_text.startswith('```'):
            csv_text = csv_text.split('\n', 1)[-1]
        if csv_text.endswith('```'):
            csv_text = csv_text.rsplit('```', 1)[0]

        return jsonify({'success': True, 'csv': csv_text.strip()})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5002))
    debug = os.getenv('FLASK_ENV') == 'development'
    print(f"Fiat-Lux Agent Service starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
