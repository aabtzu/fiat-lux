"""
Pages blueprint — serves standalone static HTML pages with no auth required.
"""

import os
from flask import Blueprint, send_from_directory

pages_bp = Blueprint('pages', __name__)

_PAGES_DIR = os.path.join(os.path.dirname(__file__), 'static', 'pages')


@pages_bp.route('/values-analysis')
def values_analysis():
    return send_from_directory(_PAGES_DIR, 'values-analysis.html')
