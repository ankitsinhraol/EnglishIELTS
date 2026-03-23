const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Missing ?id=' });

    try {
        const url = `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${id}&_format=json&_marker=0`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.jiosaavn.com/'
            }
        });
        let text = await response.text();
        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);
        const data = JSON.parse(text);

        if (!data.lyrics) {
            return res.status(404).json({ success: false, error: 'Lyrics not available' });
        }

        return res.json({
            success: true,
            data: {
                lyrics: data.lyrics.replace(/<br>/g, '\n'),
                copyright: data.lyrics_copyright,
                snippet: data.snippet
            }
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to fetch lyrics' });
    }
};