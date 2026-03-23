const fetch = require('node-fetch');

function cleanText(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/<[^>]*>/g, '').trim();
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { language = 'hindi' } = req.query;

    try {
        const url = `https://www.jiosaavn.com/api.php?__call=content.getHomepageData&_format=json&_marker=0&language=${language}`;
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

        const trending = data.new_trending || [];
        const results = trending
            .filter(item => item.type === 'song')
            .slice(0, 20)
            .map(song => ({
                id: song.id,
                name: cleanText(song.title),
                artists: cleanText(song.more_info?.artistMap?.artists?.map(a => a.name).join(', ') || ''),
                image: song.image || '',
                album: cleanText(song.more_info?.album || ''),
                duration: song.more_info?.duration || 0,
                language: song.language || language
            }));

        return res.json({ success: true, results });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Failed to fetch trending' });
    }
};