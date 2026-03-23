const fetch = require('node-fetch');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com'
};

function cleanText(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'")
               .replace(/<[^>]*>/g, '')
               .trim();
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { q, limit = 20, page = 1 } = req.query;

    if (!q) {
        return res.status(400).json({ success: false, error: 'Missing ?q= parameter' });
    }

    try {
        const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&q=${encodeURIComponent(q)}&n=${limit}&p=${page}`;
        const response = await fetch(url, { headers: HEADERS });
        let text = await response.text();

        // Clean response
        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);

        const data = JSON.parse(text);

        if (!data.results || data.results.length === 0) {
            return res.json({ success: true, results: [], total: 0 });
        }

        // Return only what's needed for display
        const results = data.results.map(song => ({
            id: song.id,
            name: cleanText(song.song || song.title),
            album: cleanText(song.album),
            artists: cleanText(song.primary_artists || song.singers),
            duration: song.duration,
            year: song.year,
            language: song.language,
            hasLyrics: song.has_lyrics === 'true',
            image: song.image || '',
            albumId: song.albumid
        }));

        return res.json({
            success: true,
            query: q,
            total: data.total || results.length,
            results
        });

    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ success: false, error: 'Search failed' });
    }
};