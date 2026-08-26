"""
Tests for the JSON / JSONL ingestion path in extractor.py.

Everything here is offline: the only Claude call on this path is _classify_text,
which the stub_classify fixture replaces.
"""

import json
import math

import pytest

import extractor as ex


# ---------------------------------------------------------------------------
# _load_json
# ---------------------------------------------------------------------------

def test_load_json_object_and_array():
    assert ex._load_json(b'{"a": 1}') == {'a': 1}
    assert ex._load_json(b'[{"a": 1}, {"a": 2}]') == [{'a': 1}, {'a': 2}]


def test_load_json_strips_utf8_bom():
    assert ex._load_json('﻿{"a": 1}'.encode('utf-8')) == {'a': 1}


def test_load_json_falls_back_to_jsonl():
    assert ex._load_json(b'{"a": 1}\n{"a": 2}\n{"a": 3}\n') == [{'a': 1}, {'a': 2}, {'a': 3}]


def test_load_json_jsonl_tolerates_blank_lines_and_trailing_commas():
    assert ex._load_json(b'{"a": 1},\n\n{"a": 2},\n') == [{'a': 1}, {'a': 2}]


def test_load_json_decodes_non_utf8_bytes():
    # 0xe9 is invalid UTF-8 but decodes as latin-1 'é'
    assert ex._load_json(b'{"name": "caf\xe9"}') == {'name': 'caf\xe9'}


@pytest.mark.parametrize('payload', [b'', b'   ', b'{not json at all', b'plain prose'])
def test_load_json_rejects_unparseable(payload):
    with pytest.raises(ValueError):
        ex._load_json(payload)


# ---------------------------------------------------------------------------
# _find_records
# ---------------------------------------------------------------------------

def test_find_records_top_level_array():
    data = [{'a': 1}, {'a': 2}]
    assert ex._find_records(data) is data


def test_find_records_nested_under_key():
    rows = [{'a': 1}]
    assert ex._find_records({'meta': 'x', 'items': rows}) is rows


def test_find_records_prefers_the_longest_list():
    short, long = [{'a': 1}], [{'b': 1}, {'b': 2}, {'b': 3}]
    assert ex._find_records({'notes': short, 'data': long}) is long


def test_find_records_ignores_scalar_lists_and_empty_lists():
    assert ex._find_records({'tags': ['x', 'y'], 'rows': []}) is None


def test_find_records_ignores_mixed_lists():
    assert ex._find_records({'rows': [{'a': 1}, 'not a record']}) is None


def test_find_records_searches_api_shaped_nesting():
    rows = [{'a': 1}]
    assert ex._find_records({'response': {'data': {'result': {'items': rows}}}}) is rows


def test_find_records_stops_at_max_depth():
    def wrap(rows, levels):
        for _ in range(levels):
            rows = {'k': rows}
        return rows

    rows = [{'a': 1}]
    assert ex._find_records(wrap(rows, ex._JSON_MAX_DEPTH)) is rows
    assert ex._find_records(wrap(rows, ex._JSON_MAX_DEPTH + 1)) is None


# ---------------------------------------------------------------------------
# _flatten_record
# ---------------------------------------------------------------------------

def test_flatten_record_joins_nested_keys_with_underscore():
    assert ex._flatten_record({'sku': 'A', 'price': {'usd': 3.5, 'eur': 3.1}}) == {
        'sku': 'A', 'price_usd': 3.5, 'price_eur': 3.1,
    }


def test_flatten_record_joins_scalar_lists():
    assert ex._flatten_record({'tags': ['x', 'y', None]}) == {'tags': 'x, y, '}


def test_flatten_record_serialises_object_lists():
    out = ex._flatten_record({'legs': [{'from': 'SFO'}, {'from': 'JFK'}]})
    assert json.loads(out['legs']) == [{'from': 'SFO'}, {'from': 'JFK'}]


def test_flatten_record_nulls_out_nan_and_inf():
    out = ex._flatten_record({'a': float('nan'), 'b': float('inf'), 'c': 1.5})
    assert out == {'a': None, 'b': None, 'c': 1.5}


def test_flatten_record_serialises_dicts_past_max_depth():
    deep = {'k': {'k': {'k': {'k': {'k': {'k': {'k': {'leaf': 1}}}}}}}}
    out = ex._flatten_record(deep)
    assert len(out) == 1
    key, value = next(iter(out.items()))
    assert isinstance(value, str) and 'leaf' in value


def test_flatten_record_truncates_long_serialised_values():
    out = ex._flatten_record({'legs': [{'note': 'y' * 5000}]})
    assert len(out['legs']) == 500


# ---------------------------------------------------------------------------
# _json_metadata
# ---------------------------------------------------------------------------

def test_json_metadata_collects_scalars_outside_the_records():
    rows = [{'a': 1}]
    data = {'report': 'Q3', 'generated': '2026-01-01', 'items': rows}
    assert ex._json_metadata(data, rows) == {'report': 'Q3', 'generated': '2026-01-01'}


def test_json_metadata_prefixes_nested_keys():
    assert ex._json_metadata({'meta': {'src': 'api'}}, None) == {'meta_src': 'api'}


def test_json_metadata_keeps_scalar_lists_but_drops_record_lists():
    rows = [{'a': 1}]
    other = [{'b': 2}]
    data = {'tags': ['x', 'y'], 'items': rows, 'extra': other}
    assert ex._json_metadata(data, rows) == {'tags': 'x, y'}


def test_json_metadata_is_capped():
    data = {f'k{i}': i for i in range(ex._JSON_META_LIMIT + 50)}
    assert len(ex._json_metadata(data, None)) == ex._JSON_META_LIMIT


# ---------------------------------------------------------------------------
# _extract_json
# ---------------------------------------------------------------------------

def test_extract_json_flat_array(stub_classify):
    result = ex._extract_json(json.dumps([{'name': 'Ann', 'score': 9},
                                          {'name': 'Bo', 'score': 7}]).encode(), 'a.json')
    assert result['file_type'] == 'stubbed type'
    assert result['table_data'] == [{'name': 'Ann', 'score': 9}, {'name': 'Bo', 'score': 7}]


def test_extract_json_flattens_nested_records(stub_classify):
    payload = {'items': [{'sku': 'A', 'price': {'usd': 3.5}}]}
    result = ex._extract_json(json.dumps(payload).encode(), 'b.json')
    assert result['table_data'] == [{'sku': 'A', 'price_usd': 3.5}]


def test_extract_json_parsed_metadata_beats_the_model(stub_classify):
    payload = {'report': 'Q3', 'items': [{'a': 1}]}
    result = ex._extract_json(json.dumps(payload).encode(), 'c.json')
    assert result['metadata']['report'] == 'Q3'          # parsed value wins
    assert result['metadata']['llm_only'] == 'from-model'  # model-only key survives


def test_extract_json_keeps_model_summary(stub_classify):
    result = ex._extract_json(b'[{"a": 1}]', 'd.json')
    assert result['summary'] == {'model_total': 1}


def test_extract_json_wraps_scalar_arrays(stub_classify):
    result = ex._extract_json(b'[1, 2, 3]', 'e.json')
    assert result['table_data'] == [{'value': 1}, {'value': 2}, {'value': 3}]


def test_extract_json_metadata_only_object_has_no_table(stub_classify):
    result = ex._extract_json(b'{"only": "metadata", "count": 4}', 'f.json')
    assert result['table_data'] is None
    assert result['metadata']['only'] == 'metadata'


def test_extract_json_caps_rows_and_says_so(stub_classify):
    rows = [{'i': i} for i in range(ex._JSON_ROW_LIMIT + 1000)]
    result = ex._extract_json(json.dumps(rows).encode(), 'big.json')
    assert len(result['table_data']) == ex._JSON_ROW_LIMIT
    header = result['text'].splitlines()[0]
    assert f'{len(rows):,} records' in header
    assert f'first {ex._JSON_ROW_LIMIT:,} kept' in header


def test_extract_json_caps_persisted_text():
    # No stub: this must not reach _classify_text before the cap is applied,
    # so drive _json_text directly.
    text = ex._json_text([{'v': 'x' * 100} for _ in range(5000)], 'big.json', 1000)
    assert len(text) < 1200
    assert 'truncated' in text


def test_extract_json_sends_only_a_small_sample_to_claude(stub_classify):
    rows = [{'i': i, 'pad': 'y' * 200} for i in range(2000)]
    ex._extract_json(json.dumps(rows).encode(), 'big.json')
    sent = stub_classify[0]
    assert len(sent) <= ex._JSON_SAMPLE_CHARS + 200   # header + truncation note
    assert '2,000 records' in sent.splitlines()[0]


def test_extract_json_reads_jsonl(stub_classify):
    result = ex._extract_json(b'{"a": 1}\n{"a": 2}\n', 'x.jsonl')
    assert result['table_data'] == [{'a': 1}, {'a': 2}]


# ---------------------------------------------------------------------------
# extract_document dispatch
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('ext', ['json', 'jsonl', 'ndjson'])
def test_get_mime_type_knows_json_extensions(ext):
    assert ex.get_mime_type(f'file.{ext}') in ('application/json', 'application/x-ndjson')


@pytest.mark.parametrize('filename', ['a.json', 'a.jsonl', 'a.ndjson', 'a.JSON'])
def test_extract_document_routes_json_by_extension(stub_classify, filename):
    result = ex.extract_document(b'[{"a": 1}]', 'text/plain', filename)
    assert result['table_data'] == [{'a': 1}]


def test_extract_document_routes_json_by_mime_type(stub_classify):
    result = ex.extract_document(b'[{"a": 1}]', 'application/json', 'export')
    assert result['table_data'] == [{'a': 1}]


def test_extract_document_falls_back_to_plain_text_on_bad_json(stub_classify):
    raw = b'{not json at all'
    result = ex.extract_document(raw, 'application/json', 'bad.json')
    assert result['table_data'] is None
    assert stub_classify[-1] == raw.decode()   # raw text went to the model as-is
