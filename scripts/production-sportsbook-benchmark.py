#!/usr/bin/env python3
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

PARLAYPING = os.environ.get('PARLAYPING_BASE', 'https://www.parlayping.net').rstrip('/')
OUTPOST = os.environ.get('SPORTS_OUTPOST_BASE', 'https://thesportsoutpost.com').rstrip('/')
SPORTS = ['NFL', 'NBA', 'WNBA', 'MLB', 'NHL']
PATHS = {sport: f'/slates/{sport.lower()}-odds.json' for sport in SPORTS}

MARKET_LABELS = {
    'passYds': 'passing yards',
    'rushYds': 'rushing yards',
    'recYds': 'receiving yards',
    'receptions': 'receptions',
    'passTds': 'passing touchdowns',
    'completions': 'completions',
    'points': 'points',
    'rebounds': 'rebounds',
    'assists': 'assists',
    'threes': 'three-pointers made',
    'steals': 'steals',
    'blocks': 'blocks',
    'turnovers': 'turnovers',
    'pra': 'points + rebounds + assists',
    'ptsRebs': 'points + rebounds',
    'ptsAsts': 'points + assists',
    'rebsAsts': 'rebounds + assists',
    'hits': 'hits',
    'totalBases': 'total bases',
    'tb': 'total bases',
    'rbi': 'RBIs',
    'hrr': 'hits + runs + RBIs',
    'stolenBases': 'stolen bases',
    'sb': 'stolen bases',
    'shotsOnGoal': 'shots on goal',
    'shots': 'shots on goal',
    'saves': 'saves',
    'goals': 'goals',
}

BOOK_ALIASES = {
    'draftkings': 'draftkings', 'dk': 'draftkings',
    'fanduel': 'fanduel', 'fd': 'fanduel',
    'caesars': 'caesars', 'williamhill': 'caesars', 'caesarssportsbook': 'caesars',
    'betmgm': 'betmgm', 'mgm': 'betmgm',
    'fanatics': 'fanatics', 'fanaticssportsbook': 'fanatics',
    'bet365': 'bet365', '365': 'bet365',
    'betrivers': 'betrivers',
    'bovada': 'bovada',
    'hardrock': 'hardrock', 'hardrockbet': 'hardrock',
    'pinnacle': 'pinnacle', 'parx': 'parx',
    'thescorebet': 'thescorebet', 'thescore': 'thescorebet', 'espnbet': 'thescorebet', 'espn': 'thescorebet',
}

MARKET_CANON = {
    'passingyards': 'passYds', 'passyards': 'passYds', 'passyds': 'passYds',
    'rushingyards': 'rushYds', 'rushyards': 'rushYds', 'rushyds': 'rushYds',
    'receivingyards': 'recYds', 'recyards': 'recYds', 'recyds': 'recYds',
    'receptions': 'receptions', 'catches': 'receptions',
    'passingtouchdowns': 'passTds', 'passtds': 'passTds',
    'completions': 'completions',
    'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists', 'threes': 'threes',
    'steals': 'steals', 'blocks': 'blocks', 'turnovers': 'turnovers',
    'pra': 'pra', 'pointsreboundsassists': 'pra',
    'ptsrebs': 'ptsRebs', 'pointsrebounds': 'ptsRebs',
    'ptsasts': 'ptsAsts', 'pointsassists': 'ptsAsts',
    'rebsasts': 'rebsAsts', 'reboundsassists': 'rebsAsts',
    'hits': 'hits', 'totalbases': 'tb', 'tb': 'tb', 'rbi': 'rbi', 'hrr': 'hrr',
    'stolenbases': 'sb', 'sb': 'sb',
    'shotsongoal': 'shots', 'shots': 'shots', 'sog': 'shots',
    'saves': 'saves', 'goals': 'goals',
}


def norm(value):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower())).strip()


def compact(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def norm_book(value):
    key = compact(value)
    return BOOK_ALIASES.get(key, key)


def canon_market(value):
    key = compact(value)
    return MARKET_CANON.get(key, str(value or ''))


def finite(value):
    if value is None or value == '':
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def valid_price(value):
    number = finite(value)
    return number is not None and number != 0


def parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def fetch_json(url, timeout=60, payload=None):
    headers = {'accept': 'application/json', 'user-agent': 'ParlayPing-Production-Benchmark/1.0'}
    data = None
    method = 'GET'
    if payload is not None:
        data = json.dumps(payload).encode()
        headers['content-type'] = 'application/json'
        method = 'POST'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def fetch_text(url, timeout=90):
    req = urllib.request.Request(url, headers={'accept': 'text/html', 'user-agent': 'ParlayPing-Production-Benchmark/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode('utf-8')


def source_native(row, side):
    prefix = 'under' if side == 'under' else 'over'
    link = row.get(prefix + 'Link') or row.get('selectionLink') or row.get('deepLink') or row.get('link')
    sid = row.get(prefix + 'Sid') or row.get('selectionId') or row.get('sid')
    return link, None if sid is None else str(sid)


def add_expected(group, book, price, link=None, sid=None):
    if not book or not valid_price(price):
        return
    book_key = norm_book(book)
    if not book_key:
        return
    item = {'book': str(book), 'price': finite(price), 'link': link or None, 'sid': None if sid is None else str(sid)}
    existing = group['expected'].get(book_key)
    if existing is None or item['price'] > existing['price']:
        group['expected'][book_key] = item


def group_key(event_id, player, market, line, side):
    return (str(event_id or ''), norm(player), canon_market(market), round(float(line), 6), side)


def generic_groups(sport, snapshot):
    now = time.time()
    groups = {}
    all_rows = snapshot.get('rows') if isinstance(snapshot, dict) else None
    for row in all_rows if isinstance(all_rows, list) else []:
        player = str(row.get('player') or '').strip()
        market = str(row.get('market') or row.get('marketKey') or '').strip()
        label = MARKET_LABELS.get(market) or MARKET_LABELS.get(canon_market(market))
        line = finite(row.get('line'))
        if not player or not label or line is None:
            continue
        start = row.get('commenceTime') or row.get('startTimeUTC') or row.get('startTime')
        start_ts = parse_time(start)
        # Prefer genuinely current/upcoming boards. Allow a small live overlap because
        # the snapshot may refresh within minutes of scheduled start.
        if start_ts is not None and start_ts < now - 15 * 60:
            continue
        event_id = row.get('eventId') or row.get('gameId') or row.get('providerEventId') or ''
        away = row.get('awayTeam') or row.get('awayName') or ''
        home = row.get('homeTeam') or row.get('homeName') or ''
        for side, field in [('over', 'overPrice'), ('under', 'underPrice')]:
            price = row.get(field)
            if not valid_price(price):
                continue
            key = group_key(event_id, player, market, line, side)
            group = groups.setdefault(key, {
                'sport': sport, 'eventId': str(event_id or ''), 'player': player,
                'market': market, 'marketCanon': canon_market(market), 'label': label,
                'line': line, 'side': side, 'start': start, 'startTs': start_ts,
                'away': str(away or ''), 'home': str(home or ''), 'expected': {},
            })
            link, sid = source_native(row, side)
            add_expected(group, row.get('book') or row.get('sportsbook'), price, link, sid)
    return list(groups.values())


def nested_offers(branch):
    out = []
    if not isinstance(branch, dict):
        return out
    if isinstance(branch.get('best'), dict):
        out.append(branch['best'])
    if isinstance(branch.get('all'), list):
        out.extend(item for item in branch['all'] if isinstance(item, dict))
    # Some snapshots may put the offer directly in the side object.
    if (branch.get('book') or branch.get('sportsbook')) and valid_price(branch.get('price', branch.get('oddsAmerican'))):
        out.append(branch)
    return out


def nfl_groups(snapshot):
    now = time.time()
    groups = {}
    games = snapshot.get('games') if isinstance(snapshot, dict) else None
    for game in games if isinstance(games, list) else []:
        start = game.get('startDateUTC') or game.get('startTimeUTC') or game.get('commenceTime') or game.get('startTime')
        start_ts = parse_time(start)
        if start_ts is not None and start_ts < now - 15 * 60:
            continue
        event_id = game.get('eventId') or game.get('gameId') or game.get('id') or game.get('fixtureId') or ''
        away = game.get('awayTeam') or (game.get('away') or {}).get('abbr') if isinstance(game.get('away'), dict) else game.get('away')
        home = game.get('homeTeam') or (game.get('home') or {}).get('abbr') if isinstance(game.get('home'), dict) else game.get('home')
        away = away or game.get('awayName') or ''
        home = home or game.get('homeName') or ''
        for player_obj in game.get('players') or []:
            player = str(player_obj.get('name') or '').strip()
            if not player:
                continue
            odds = player_obj.get('odds') or {}
            if not isinstance(odds, dict):
                continue
            for market, slot in odds.items():
                label = MARKET_LABELS.get(market)
                if not label or not isinstance(slot, dict):
                    continue
                source_rows = slot.get('alternates') if isinstance(slot.get('alternates'), list) and slot.get('alternates') else None
                if source_rows is None and finite(slot.get('line')) is not None:
                    source_rows = [{'line': slot.get('line'), 'over': slot.get('over'), 'under': slot.get('under')}]
                for row in source_rows or []:
                    line = finite(row.get('line'))
                    if line is None:
                        continue
                    for side in ['over', 'under']:
                        offers = nested_offers(row.get(side))
                        if not offers:
                            continue
                        key = group_key(event_id, player, market, line, side)
                        group = groups.setdefault(key, {
                            'sport': 'NFL', 'eventId': str(event_id or ''), 'player': player,
                            'market': market, 'marketCanon': canon_market(market), 'label': label,
                            'line': line, 'side': side, 'start': start, 'startTs': start_ts,
                            'away': str(away or ''), 'home': str(home or ''), 'expected': {},
                        })
                        for offer in offers:
                            price = offer.get('price', offer.get('oddsAmerican'))
                            link = offer.get('link') or offer.get('deepLink') or offer.get('selectionLink')
                            sid = offer.get('sid') or offer.get('selectionId')
                            add_expected(group, offer.get('book') or offer.get('sportsbook'), price, link, sid)
    return list(groups.values())


def choose_groups(groups, count=3):
    usable = [g for g in groups if g.get('expected')]
    if not usable:
        return []
    by_event = defaultdict(list)
    for group in usable:
        by_event[group.get('eventId') or ''].append(group)

    def best_distinct(items, limit):
        ranked = sorted(items, key=lambda g: (-len(g['expected']), g.get('startTs') or 10**20, norm(g['player']), g['marketCanon']))
        selected = []
        seen_players = set()
        for group in ranked:
            p = norm(group['player'])
            if p in seen_players:
                continue
            selected.append(group)
            seen_players.add(p)
            if len(selected) >= limit:
                return selected
        for group in ranked:
            if group in selected:
                continue
            selected.append(group)
            if len(selected) >= limit:
                break
        return selected

    event_choices = []
    for event_id, items in by_event.items():
        chosen = best_distinct(items, count)
        if len(chosen) >= count:
            coverage = sum(len(g['expected']) for g in chosen)
            start = min((g.get('startTs') for g in chosen if g.get('startTs') is not None), default=10**20)
            event_choices.append((coverage, -start, chosen))
    if event_choices:
        event_choices.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return event_choices[0][2]
    return best_distinct(usable, min(count, len(usable)))


def leg_text(group):
    line = group['line']
    line_text = str(int(line)) if float(line).is_integer() else str(line).rstrip('0').rstrip('.')
    return f"{group['player']} {group['side']} {line_text} {group['label']}"


def make_text(sport, groups):
    lines = [sport]
    events = {(g.get('away'), g.get('home')) for g in groups if g.get('away') and g.get('home')}
    if len(events) == 1:
        away, home = next(iter(events))
        lines.append(f'{away} @ {home}')
    lines.extend(leg_text(g) for g in groups)
    return '\n'.join(lines)


def parse_builder_state(html):
    match = re.search(r'window\.__PARLAYPING_BUILDER__=(\{.*?\});</script>', html, re.S)
    if not match:
        raise AssertionError('Builder state payload not found')
    return json.loads(match.group(1))


def match_builder_leg(builder_legs, group, used):
    for index, leg in enumerate(builder_legs):
        if index in used:
            continue
        if norm(leg.get('player')) != norm(group['player']):
            continue
        if canon_market(leg.get('market') or leg.get('displayMarket')) != group['marketCanon']:
            continue
        side = str(leg.get('side') or 'over').lower()
        wanted_side = group['side']
        if side != wanted_side:
            continue
        line = finite(leg.get('line'))
        if line is None or abs(line - group['line']) > 1e-7:
            continue
        used.add(index)
        return leg
    return None


def offer_by_book(leg, book_key):
    offers = leg.get('bookOffers') if isinstance(leg, dict) else None
    if not isinstance(offers, dict):
        return None
    for name, offer in offers.items():
        if norm_book(name) == book_key and isinstance(offer, dict):
            return offer
    return None


def benchmark_sport(sport):
    snapshot_url = OUTPOST + PATHS[sport] + '?benchmark=' + str(int(time.time()))
    snapshot = fetch_json(snapshot_url, 60)
    meta = snapshot.get('meta') if isinstance(snapshot, dict) else {}
    source = str((meta or {}).get('source') or '').lower()
    if source and source != 'parlayapi':
        raise AssertionError(f'{sport} snapshot source is {source}, expected parlayapi')
    groups = nfl_groups(snapshot) if sport == 'NFL' else generic_groups(sport, snapshot)
    selected = choose_groups(groups, 3)
    if not selected:
        return {
            'sport': sport, 'status': 'no-current-board', 'snapshotFetchedAt': (meta or {}).get('fetchedAt'),
            'candidateGroups': 0, 'legs': 0, 'expectedOffers': 0, 'matchedPrices': 0,
        }

    text = make_text(sport, selected)
    created = fetch_json(PARLAYPING + '/api/landing-create', 75, {'text': text})
    if created.get('ok') is not True:
        raise AssertionError(f'{sport} landing-create failed: {created}')
    if int(created.get('legCount') or 0) != len(selected):
        raise AssertionError(f"{sport} parser produced {created.get('legCount')} legs for {len(selected)} selected: {text!r}")
    builder_url = created.get('builderUrl')
    if not builder_url:
        raise AssertionError(f'{sport} landing-create returned no builder URL')

    started = time.monotonic()
    html = fetch_text(builder_url, 120)
    elapsed = time.monotonic() - started
    state = parse_builder_state(html)
    builder_legs = ((state.get('slip') or {}).get('legs') or [])
    used = set()

    expected_count = 0
    matched_count = 0
    missing = []
    mismatches = []
    native_link_expected = 0
    native_link_preserved = 0
    native_sid_expected = 0
    native_sid_preserved = 0
    fallback_prices = 0
    selected_results = []
    source_full = None
    builder_full = None

    for group in selected:
        source_books = set(group['expected'])
        source_full = source_books if source_full is None else source_full & source_books
        leg = match_builder_leg(builder_legs, group, used)
        if leg is None:
            missing.append({'player': group['player'], 'market': group['marketCanon'], 'reason': 'builder-leg-missing'})
            expected_count += len(group['expected'])
            selected_results.append({'player': group['player'], 'market': group['marketCanon'], 'line': group['line'], 'side': group['side'], 'sourceBooks': sorted(source_books), 'builderBooks': []})
            continue

        builder_priced = set()
        offers = leg.get('bookOffers') or {}
        for name, offer in offers.items() if isinstance(offers, dict) else []:
            if isinstance(offer, dict) and valid_price(offer.get('oddsAmerican')):
                builder_priced.add(norm_book(name))
        builder_full = builder_priced if builder_full is None else builder_full & builder_priced

        for book_key, expected in group['expected'].items():
            expected_count += 1
            offer = offer_by_book(leg, book_key)
            if offer is None or not valid_price(offer.get('oddsAmerican')):
                missing.append({'player': group['player'], 'market': group['marketCanon'], 'book': expected['book'], 'expected': expected['price']})
                continue
            actual = finite(offer.get('oddsAmerican'))
            if abs(actual - expected['price']) > 1e-9:
                mismatches.append({'player': group['player'], 'market': group['marketCanon'], 'book': expected['book'], 'expected': expected['price'], 'actual': actual, 'priceKind': offer.get('priceKind')})
            else:
                matched_count += 1
            if offer.get('priceKind') == 'verified-exact-resolver':
                fallback_prices += 1
            if expected.get('link'):
                native_link_expected += 1
                if offer.get('selectionLink') == expected['link']:
                    native_link_preserved += 1
            if expected.get('sid'):
                native_sid_expected += 1
                if str(offer.get('selectionId') or '') == expected['sid']:
                    native_sid_preserved += 1

        selected_results.append({
            'player': group['player'], 'market': group['marketCanon'], 'line': group['line'], 'side': group['side'],
            'matchup': f"{group.get('away')} @ {group.get('home')}" if group.get('away') and group.get('home') else None,
            'start': group.get('start'), 'sourceBooks': sorted(source_books), 'builderBooks': sorted(builder_priced),
        })

    source_full = source_full or set()
    builder_full = builder_full or set()
    status = 'pass' if not missing and not mismatches and matched_count == expected_count else 'gap'
    return {
        'sport': sport,
        'status': status,
        'snapshotFetchedAt': (meta or {}).get('fetchedAt') or (meta or {}).get('generatedAt'),
        'snapshotRows': (meta or {}).get('rows') or (meta or {}).get('sportsbookRows') or (meta or {}).get('rawRows'),
        'candidateGroups': len(groups),
        'legs': len(selected),
        'builderSeconds': round(elapsed, 3),
        'expectedOffers': expected_count,
        'matchedPrices': matched_count,
        'priceCoveragePct': round((matched_count / expected_count) * 100, 1) if expected_count else 0,
        'missingPrices': len(missing),
        'priceMismatches': len(mismatches),
        'nativeLinksExpected': native_link_expected,
        'nativeLinksPreserved': native_link_preserved,
        'nativeSidsExpected': native_sid_expected,
        'nativeSidsPreserved': native_sid_preserved,
        'fallbackPricesOnPrimaryOffers': fallback_prices,
        'sourceFullSlipBooks': sorted(source_full),
        'builderFullSlipBooks': sorted(builder_full),
        'selectionText': text,
        'selections': selected_results,
        'missing': missing[:20],
        'mismatches': mismatches[:20],
    }


def write_summary(results, total):
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if not path:
        return
    lines = [
        '# Production sportsbook benchmark', '',
        '| Sport | Status | Legs | Source exact offers | Matched | Coverage | Native links | Native SIDs | Builder |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ]
    for row in results:
        lines.append(
            f"| {row['sport']} | {row['status']} | {row.get('legs',0)} | {row.get('expectedOffers',0)} | {row.get('matchedPrices',0)} | {row.get('priceCoveragePct',0)}% | "
            f"{row.get('nativeLinksPreserved',0)}/{row.get('nativeLinksExpected',0)} | {row.get('nativeSidsPreserved',0)}/{row.get('nativeSidsExpected',0)} | {row.get('builderSeconds','—')}s |"
        )
    lines += ['', f"**Overall exact-price coverage:** {total['matchedPrices']}/{total['expectedOffers']} ({total['priceCoveragePct']}%)", f"**Overall status:** {total['status']}"]
    with open(path, 'a', encoding='utf-8') as handle:
        handle.write('\n'.join(lines) + '\n')


def main():
    results = []
    hard_errors = []
    for sport in SPORTS:
        try:
            row = benchmark_sport(sport)
        except Exception as exc:
            row = {'sport': sport, 'status': 'error', 'error': str(exc), 'legs': 0, 'expectedOffers': 0, 'matchedPrices': 0}
            hard_errors.append({'sport': sport, 'error': str(exc)})
        results.append(row)
        print('SPORT_BENCHMARK', json.dumps(row, separators=(',', ':')), flush=True)

    expected = sum(int(row.get('expectedOffers') or 0) for row in results)
    matched = sum(int(row.get('matchedPrices') or 0) for row in results)
    missing = sum(int(row.get('missingPrices') or 0) for row in results)
    mismatches = sum(int(row.get('priceMismatches') or 0) for row in results)
    benchmarked = sum(1 for row in results if row.get('legs'))
    total = {
        'status': 'pass' if not hard_errors and missing == 0 and mismatches == 0 and benchmarked == len(SPORTS) else 'gap',
        'sportsRequested': len(SPORTS), 'sportsBenchmarked': benchmarked,
        'expectedOffers': expected, 'matchedPrices': matched,
        'priceCoveragePct': round((matched / expected) * 100, 1) if expected else 0,
        'missingPrices': missing, 'priceMismatches': mismatches,
        'hardErrors': hard_errors,
        'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    }
    with open('production-sportsbook-benchmark.json', 'w', encoding='utf-8') as handle:
        json.dump({'summary': total, 'sports': results}, handle, indent=2)
        handle.write('\n')
    print('BENCHMARK_TOTAL', json.dumps(total, separators=(',', ':')), flush=True)
    write_summary(results, total)
    if total['status'] != 'pass':
        sys.exit(1)


if __name__ == '__main__':
    main()
