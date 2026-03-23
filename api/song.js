const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const DECRYPT_KEY = CryptoJS.enc.Utf8.parse('3834659127733675');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com'
};

function decryptUrl(encryptedUrl) {
    try {
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
            DECRYPT_KEY,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        return null;
    }
}

function getDownloadUrls(encryptedUrl) {
    const decrypted = decryptUrl(encryptedUrl);
    if (!decrypted) return [];
    return ['48', '96', '160', '320'].map(q => ({
        quality: q + 'kbps',
        url: decrypted.replace(/_\d+\.mp4/, `_${q}.mp4`).replace(/_\d+\.m4a/, `_${q}.m4a`)
    }));
}

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

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Missing ?id= parameter' });
    }

    try {
        const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${id}&_format=json&_marker=0`;
        const response = await fetch(url, { headers: HEADERS });
        let text = await response.text();

        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);

        const data = JSON.parse(text);
        const song = data[id] || Object.values(data)[0];

        if (!song) {
            return res.status(404).json({ success: false, error: 'Song not found' });
        }

        return res.json({
            success: true,
            data: {
                id: song.id,
                name: cleanText(song.song || song.title),
                album: cleanText(song.album),
                year: song.year,
                duration: song.duration,
                language: song.language,
                artists: cleanText(song.primary_artists || song.singers),
                featuredArtists: cleanText(song.featured_artists),
                label: song.label,
                image: {
                    low: song.image || '',
                    medium: (song.image || '').replace('150x150', '500x500'),
                    high: (song.image || '').replace('150x150', '500x500')
                },
                downloadUrl: getDownloadUrls(song.encrypted_media_url),
                hasLyrics: song.has_lyrics === 'true',
                playCount: parseInt(song.play_count) || 0,
                copyright: song.copyright_text,
                permaUrl: song.perma_url,
                releaseDate: song.release_date,
                is320kbps: song['320kbps'] === 'true'
            }
        });

    } catch (error) {
        console.error('Song error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch song' });
    }
};