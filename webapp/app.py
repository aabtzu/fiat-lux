"""
Fiat Lux — Flask application factory.
"""

import os
from datetime import timedelta
from flask import Flask
from dotenv import load_dotenv
from db import init_db_path, initialise_schema
from auth_routes import auth_bp
from main_routes import main_bp
from file_routes import file_bp
from view_routes import view_bp
from share_routes import share_bp

load_dotenv()


def create_app() -> Flask:
    app = Flask(__name__)
    app.secret_key = os.environ['SECRET_KEY']
    app.permanent_session_lifetime = timedelta(days=7)

    data_dir = os.environ.get(
        'DATA_DIR',
        os.path.join(os.path.dirname(__file__), '..', 'data')
    )
    os.makedirs(data_dir, exist_ok=True)
    app.config['DATA_DIR'] = data_dir
    init_db_path(data_dir)
    initialise_schema()

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(file_bp)
    app.register_blueprint(view_bp)
    app.register_blueprint(share_bp)

    from auth import get_current_user

    @app.context_processor
    def inject_user():
        return {'current_user': get_current_user()}

    _BADGE_COLORS = [
        'bg-blue-100 text-blue-700',
        'bg-green-100 text-green-700',
        'bg-purple-100 text-purple-700',
        'bg-amber-100 text-amber-700',
        'bg-pink-100 text-pink-700',
        'bg-teal-100 text-teal-700',
    ]

    @app.template_global()
    def badge_class(file_type: str) -> str:
        """Return Tailwind classes for a file-type badge, consistent per type string."""
        if not file_type or file_type == 'unknown':
            return 'bg-gray-100 text-gray-500'
        h = 0
        for ch in file_type:
            h = (h * 31 + ord(ch)) & 0xFFFF
        return _BADGE_COLORS[h % len(_BADGE_COLORS)]

    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=True, port=port)
