import xml.etree.ElementTree as ET, json, re

tree = ET.parse('feed.xml')
root = tree.getroot()
ns = {'content': 'http://purl.org/rss/1.0/modules/content/'}

posts = []
for item in root.findall('.//item'):
    title    = (item.findtext('title') or '').strip()
    url      = (item.findtext('link') or '').strip()
    pub_date = (item.findtext('pubDate') or '').strip()
    desc     = (item.findtext('description') or '').strip()
    cover    = None
    enc = item.find('enclosure')
    if enc is not None:
        cover = enc.get('url')
    if not cover:
        body = item.findtext('content:encoded', namespaces=ns) or ''
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', body)
        if m:
            cover = m.group(1)
    posts.append({'title': title, 'canonical_url': url, 'post_date': pub_date, 'cover_image': cover, 'description': desc})

with open('posts.json', 'w') as f:
    json.dump(posts, f, indent=2)

print(f"Wrote {len(posts)} posts")
for p in posts:
    print(f"  - {p['title']}")
