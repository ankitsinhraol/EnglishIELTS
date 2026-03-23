const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

// 3DES key: 38346591 (8 bytes)
const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');
const ZERO_IV = CryptoJS.enc.Utf8.parse('\0\0\0\0\0\0\0\0');

function decrypt_url(encrypted_url) {
    try {
        const encrypted = CryptoJS.enc.Base64.parse(encrypted_url);
        const decrypted = CryptoJS.TripleDES.decrypt(
            { ciphertext: encrypted },
            DES_KEY,
            {
                iv: ZERO_IV,
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            }
        );
        let url = decrypted.toString(CryptoJS.enc.Utf8);

        // Critical fix: JioSaavn returns _96.mp4 even for 320kbps songs
        // We must force replace it with _320.mp4
        url = url.replace('_96.mp4', '_320.mp4');
        return url;
    } catch (e) {
        console.error('3DES Decryption failed:', e);
        return null;
    }
}

function generate_all_qualities(base_url_320) {
    if (!base_url_320) return [];

    // Extract base path: https://aac.saavncdn.com/615/abc123def456
    const match = base_url_320.match(/^(https:\/\/[^\/]+\/[^\/]+\/[^\/]+\/)([^_]+)_320\.mp4$/);
    if (!match) return [{ quality: '320kbps', link: base_url_320 }];

    const base = match[1] + match[2];
    const qualities = ['12', '48', '96', '160', '320'];

    return qualities.map(q => ({
        quality: q + 'kbps',
        link: `${base}_${q}.mp4`
    }));
}

function clean(text) {
    return text ? text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim() : '';
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'Cookie': 'L=hindi,english,punjabi,tamil,telugu'
};

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    try {
        const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${id}&_format=json&_marker=0`;
        const response = await fetch(url, { headers: HEADERS });
        let text = await response.text();

        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);
        const data = JSON.parse(text);

        const song = data[id] || Object.values(data)[0];
        if (!song) return res.status(404).json({ success: false, error: 'Song not found' });

        // Use encrypted_media_url first, fallback to encrypted_drm_media_url
        let encrypted = song.encrypted_media_url || song.encrypted_drm_media_url;
        if (!encrypted) return res.status(500).json({ success: false, error: 'No encrypted URL' });

        const decrypted_320 = decrypt_url(encrypted);
        const downloadUrl = generate_all_qualities(decrypted_320);

        const result = {
            success: true,
            data: {
                id: song.id,
                name: clean(song.song || song.title),
                album: clean(song.album),
                artists: clean(song.primary_artists || song.singers),
                image: {
                    low: song.image || '',
                    medium: song.image?.replace('150x150', '500x500') || '',
                    high: song.image?.replace('150x150', '500x500') || ''
                },
                duration: parseInt(song.duration) || 0,
                year: song.year || '',
                language: song.language || '',
                hasLyrics: song.has_lyrics === 'true',
                downloadUrl: downloadUrl.length > 0 ? downloadUrl : [{ quality: '320kbps', link: decrypted_320 }]
            }
        };

        res.json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};