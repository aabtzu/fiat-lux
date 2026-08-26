"""Guards for the mobile layout rules that keep the view page one screen wide.

Background: the view page declares ``width=device-width``. When any element
overflows horizontally, mobile browsers widen the *layout viewport* to fit it
and scale the whole page down to compensate. Measured on a 390px phone, the
header alone forced a 764px layout viewport, so the page rendered at 51% and
the visualization occupied 183 real pixels. Both reported symptoms — a
half-width visualization and chat text clipped at the right edge — were that
one bug.

The same failure mode, from a different cause, was fixed in the sibling
libertas-travel app (commit 0989e659: a 390px viewport became 736px there).
The lesson worth keeping is that horizontal overflow on a phone is never
cosmetic — it rescales everything.

CI has no browser, so these are text assertions on the template, stylesheet
and script. Each one pins an invariant that actually broke, and says in its
failure message why it matters.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

WEBAPP = Path(__file__).resolve().parent.parent
HEADER_HTML = WEBAPP / "templates" / "includes" / "view_header.html"
CHAT_HTML = WEBAPP / "templates" / "includes" / "view_chat.html"
APP_CSS = WEBAPP / "static" / "css" / "app.css"
VIEW_JS = WEBAPP / "static" / "js" / "view.js"

# The chat panel becomes a full-screen overlay below Tailwind's md breakpoint.
# 767.98px is the largest width that is still "below md" (md is min-width: 768px).
MOBILE_MAX_WIDTH = "767.98px"
MD_PX = 768

TAILWIND_BREAKPOINTS = {"sm": 640, "md": 768, "lg": 1024, "xl": 1280, "2xl": 1536}


def _row_breakpoint(header_classes: str) -> int:
    """Width at which the header stops stacking and becomes a single row."""
    match = re.search(r"\b(sm|md|lg|xl|2xl):flex-row\b", header_classes)
    assert match, (
        "the header must become a row at a named breakpoint; without a prefix "
        "it is either always stacked or always side-by-side"
    )
    return TAILWIND_BREAKPOINTS[match.group(1)]


def _classes(text: str, tag: str) -> str:
    """Return the class attribute of the first ``tag`` in ``text``."""
    match = re.search(rf"<{tag}[^>]*\bclass=\"([^\"]*)\"", text, re.DOTALL)
    assert match, f"no <{tag}> with a class attribute"
    return " ".join(match.group(1).split())


def _enclosing_div_classes(text: str, needle: str) -> str:
    """Return the class attribute of the nearest <div> opening before ``needle``."""
    at = text.index(needle)
    start = text.rindex("<div", 0, at)
    match = re.match(r"<div[^>]*\bclass=\"([^\"]*)\"", text[start:], re.DOTALL)
    assert match, f"the <div> wrapping {needle!r} has no class attribute"
    return " ".join(match.group(1).split())


def _media_block(css: str, header: str) -> str:
    """Return the body of a media query, matched by counting braces."""
    start = css.index(header)
    brace = css.index("{", start)
    depth = 0
    for i in range(brace, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return css[brace + 1 : i]
    raise AssertionError(f"unbalanced braces after {header!r}")


def _rule(block: str, selector: str) -> str:
    pattern = re.compile(
        r"(?:^|[},])\s*" + re.escape(selector) + r"\s*(?:,[^{]*)?\{([^}]*)\}", re.MULTILINE
    )
    match = pattern.search(block)
    assert match, f"no rule for {selector!r}"
    return match.group(1)


@pytest.fixture(scope="module")
def header() -> str:
    return HEADER_HTML.read_text()


@pytest.fixture(scope="module")
def view_js() -> str:
    return VIEW_JS.read_text()


@pytest.fixture(scope="module")
def mobile_css() -> str:
    return _media_block(APP_CSS.read_text(), f"@media (max-width: {MOBILE_MAX_WIDTH})")


# ---------------------------------------------------------------------------
# The header — the element that actually widened the viewport
# ---------------------------------------------------------------------------

def test_header_control_row_wraps(header: str):
    """This row is what forced the 764px layout viewport.

    Seven controls in a nowrap row measured ~748px inside a ~358px container.
    """
    classes = _enclosing_div_classes(header, '{% include "includes/user_menu.html" %}')
    assert "flex-wrap" in classes, (
        "the header control row must wrap; seven controls in one nowrap row "
        "need ~748px, and the overflow makes mobile browsers widen the layout "
        "viewport (measured 390px -> 764px) and scale the whole page to 51%"
    )
    assert not re.search(r"(?<!:)\bflex-nowrap\b", classes), (
        "an unprefixed flex-nowrap would re-break every screen width; keep "
        "nowrap behind a breakpoint prefix so it only applies where there is room"
    )


def test_header_stacks_title_above_controls_on_mobile(header: str):
    classes = _classes(header, "header")
    assert "flex-col" in classes, (
        "the header must stack by default; side-by-side on a phone, the title "
        "is squeezed to one word per line and the controls overflow"
    )
    _row_breakpoint(classes)  # asserts a breakpoint prefix is present at all


def test_header_title_can_shrink_and_wrap(header: str):
    """A flex item will not shrink below its content's intrinsic width."""
    title_div = _enclosing_div_classes(header, "<h1")
    assert "min-w-0" in title_div, (
        "the title column needs min-w-0 or it refuses to shrink below its "
        "intrinsic width and pushes the control row off the screen"
    )
    assert "break-words" in _classes(header, "h1"), (
        "the title must wrap on word boundaries; without it a long name "
        "renders one word per line and inflates the header's height"
    )


# ---------------------------------------------------------------------------
# The chat overlay
# ---------------------------------------------------------------------------

def test_chat_overlay_is_hidden_not_parked_offscreen(mobile_css: str):
    """The libertas-travel lesson, pinned here before anyone reintroduces it.

    There, the chat sidebar was parked with ``right: -100%``. An element
    outside the right edge counts as scrollable overflow, which widens the
    layout viewport and drags fixed-position elements off screen. Fiat-lux
    hides its panel with ``display: none`` (Tailwind's ``hidden``), which
    costs no layout. If this ever becomes a slide-in, it must use a transform.
    """
    rule = _rule(mobile_css, ".chat-panel")
    assert not re.search(r"(right|left|top|bottom|inset):\s*-", rule), (
        "the mobile chat panel must not be parked at a negative offset; that "
        "counts as scrollable overflow and widens the layout viewport. Hide "
        "it (display:none) or move it with a transform, which costs no layout"
    )


def test_chat_starts_closed_on_phones(view_js: str):
    """Below md the panel covers the screen, so leaving it open hides the viz."""
    # Match the guarded call, not the two names separately: setChatOpen(false)
    # also appears in the close-button handler, so a looser check passes even
    # with this behaviour deleted.
    assert re.search(r"CHAT_FULLSCREEN\.matches\)\s*setChatOpen\(false\)", view_js), (
        "the chat panel is a full-screen overlay below md, so it must start "
        "closed there; otherwise you land on the view page and the "
        "visualization is behind the chat with no hint it is there"
    )


def test_chat_overlay_breakpoint_agrees_between_css_and_js(view_js: str):
    """Two files encode this breakpoint, and a mismatch is invisible.

    It would leave a band of widths where the panel is a full-screen overlay
    while the script still treats it as a sidebar, or the reverse.
    """
    assert f"@media (max-width: {MOBILE_MAX_WIDTH})" in APP_CSS.read_text(), (
        f"app.css must use max-width: {MOBILE_MAX_WIDTH} for the chat overlay "
        f"so it butts against Tailwind's md (min-width: {MD_PX}px) with no gap "
        f"and no overlap"
    )
    assert f"(max-width: {MOBILE_MAX_WIDTH})" in view_js, (
        "view.js must match the stylesheet's breakpoint, or the panel can be "
        "an overlay while the script still thinks it is a sidebar"
    )


def test_header_stays_stacked_while_the_chat_is_still_a_sidebar(header: str):
    """The header gets a single row only once there is room for one.

    From md up the chat panel is an inline sidebar taking a fixed 320px, so
    the header has that much less to work with. Turning the header back into a
    row at md would put seven controls and the title into ~430px, which is
    what overflowed in the first place. lg is the first width where it fits.
    """
    row_at = _row_breakpoint(_classes(header, "header"))
    assert row_at > MD_PX, (
        f"the header becomes a row at {row_at}px, but the chat sidebar is "
        f"already inline and 320px wide from {MD_PX}px up; the header needs "
        f"to stay stacked until there is room for the controls beside it"
    )


# ---------------------------------------------------------------------------
# The responsive bridge injected into the visualization iframe
# ---------------------------------------------------------------------------

def test_responsive_bridge_is_injected_into_every_visualization(view_js: str):
    body = view_js.split("function setVisualization", 1)
    assert len(body) == 2, "setVisualization is missing from view.js"
    assert "RESPONSIVE_BRIDGE" in body[1].split("\n}", 1)[0], (
        "setVisualization must inject RESPONSIVE_BRIDGE alongside the other "
        "bridges, or model-authored tables and grids overflow the frame on a "
        "phone with no way to reach the hidden columns"
    )


def test_responsive_bridge_is_reversible(view_js: str):
    """This is the bug the first version of the bridge shipped with.

    The iframe is transiently narrow before the page stylesheet lands, so a
    one-way transform fired at desktop width too and left a 1280px frame stuck
    in the mobile layout: `209px 209px 209px 209px 0px 0px`, six grid tracks
    where the model wrote four. Phones also rotate.
    """
    bridge = view_js.split("const RESPONSIVE_BRIDGE", 1)
    assert len(bridge) == 2, "RESPONSIVE_BRIDGE is missing from view.js"
    bridge = bridge[1].split("</scr'", 1)[0]

    assert "function wide()" in bridge and "function narrow()" in bridge, (
        "the bridge must have both directions; a one-way version leaves a "
        "desktop-width frame stuck in the mobile layout after any transient "
        "narrow measurement"
    )
    assert 'addEventListener("resize"' in bridge, (
        "the bridge must re-evaluate on resize, or the frame keeps whichever "
        "layout it picked the first time it ran"
    )
    assert "MQ.addEventListener" in bridge or "MQ.addListener" in bridge, (
        "the bridge must react to the media query changing, which is what "
        "rotating a phone into landscape does"
    )
    assert "el.dataset.flGrid" in bridge and "el.style.gridTemplateColumns=el.dataset.flGrid" in bridge, (
        "the bridge must stash the original grid-template-columns and restore "
        "it verbatim; reverting to a guess is not reverting"
    )


def test_responsive_bridge_only_touches_what_overflows(view_js: str):
    bridge = view_js.split("const RESPONSIVE_BRIDGE", 1)[1].split("</scr'", 1)[0]
    assert "function overflows(" in bridge, (
        "the bridge must test each element for actual overflow; rewriting "
        "layouts that already fit would override the model's design for no reason"
    )
    assert "matchMedia" in bridge, (
        "the bridge must be gated on a media query so desktop frames are "
        "never rewritten"
    )


def test_styled_selectors_exist_in_the_templates():
    """A rule whose selector matches nothing is dead code that reads as a fix.

    libertas-travel carried a mobile header rule targeting `.header-title
    input` — a selector matching no element — which is why its title kept
    desktop sizing on phones long after the rule was written.
    """
    # Look in the class attribute specifically: the panel also carries
    # id="chat-panel", so a substring search finds the name even after the
    # class the stylesheet targets has been renamed away.
    chat_html = CHAT_HTML.read_text()
    assert re.search(r"class=\"[^\"]*\bchat-panel\b", chat_html), (
        "app.css styles .chat-panel for mobile but no element in "
        "view_chat.html carries that class, so the overlay rule is dead"
    )
