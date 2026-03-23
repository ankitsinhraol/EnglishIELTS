const fetch = require('node-fetch');
const forge = require('node-forge');

// ===== DES DECRYPTION USING NODE-FORGE =====
const DES_KEY = '38346591';
const QUALITIES = ['12', '48', '96', '160', '320'];

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;

    try {
        let cleanUrl = encryptedUrl.trim();

        // Fix base64 padding
        while (cleanUrl.length % 4 !== 0) {
            cleanUrl += '=';
        }

        // Base64 decode to binary string
        const encrypted = forge.util.decode64(cleanUrl);

        // Create DES-ECB cipher
        const decipher = forge.cipher.createDecipher('DES-ECB', DES_KEY);
        decipher.start();
        decipher.update(forge.util.createBuffer(encrypted));
        const success = decipher.finish();

        if (!success) {
            console.error('DES decryption finish() returned false');
            return null;
        }

        const decrypted = decipher.output.toString('utf8');

        if (!decrypted || decrypted.length < 10) {
            console.error('Decrypted URL too short:', decrypted);
            return null;
        }

        return decrypted;

    } catch (e) {
        console.error('Decryption error:', e.message);
        return null;
    }
}

function generateDownloadUrls(encryptedMediaUrl, is320) {
    const decryptedUrl = decryptUrl(encryptedMediaUrl);
    if (!decryptedUrl) return [];

    const qualities = is320 ? QUALITIES : QUALITIES.filter(q => q !== '320');

    return qualities.map(q => ({
        quality: q + 'kbps',
        link: decryptedUrl
            .replace(/_\d+\.mp4/, `_${q}.mp4`)
            .replace(/_\d+\.m4a/, `_${q}.m4a`)
    }));
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'Cookie': 'L=hindi%2Cenglish%2Cpunjabi%2Ctamil%2Ctelugu'
};

function cleanText(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'")
               .replace(/<[^>]*>/g, '')
               .trim();
}

function formatSong(rawSong) {
    if (!rawSong || typeof rawSong !== 'object' || !rawSong.id) return null;

    const baseImage = rawSong.image || '';
    const is320 = rawSong['320kbps'] === 'true';

    const downloadUrl = generateDownloadUrls(rawSong.encrypted_media_url, is320);

    return {
        id: rawSong.id,
        name: cleanText(rawSong.song || rawSong.title || ''),
        album: cleanText(rawSong.album || ''),
        year: rawSong.year || '',
        duration: parseInt(rawSong.duration) || 0,
        language: rawSong.language || '',
        label: cleanText(rawSong.label || ''),
        artists: {
            primary: cleanText(rawSong.primary_artists || rawSong.singers || ''),
            featured: cleanText(rawSong.featured_artists || ''),
            music: cleanText(rawSong.music || ''),
            all: cleanText(rawSong.primary_artists || rawSong.singers || '')
        },
        image: {
            low: baseImage,
            medium: baseImage.replace('150x150', '500x500'),
            high: baseImage.replace('150x150', '500x500')
        },
        downloadUrl: downloadUrl,
        hasLyrics: rawSong.has_lyrics === 'true',
        playCount: parseInt(rawSong.play_count) || 0,
        copyright: rawSong.copyright_text || '',
        permaUrl: rawSong.perma_url || '',
        albumId: rawSong.albumid || '',
        albumUrl: rawSong.album_url || '',
        releaseDate: rawSong.release_date || '',
        is320kbps: is320,
        explicit: rawSong.explicit_content === 1,
        disabled: rawSong.disabled === 'true',
        disabledReason: rawSong.disabled_text || rawSong.rights?.reason || '',
        previewUrl: rawSong.media_preview_url || ''
    };
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'Missing ?id= parameter'
        });
    }

    try {
        const ids = id.replace(/\s/g, '');
        const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${ids}&_format=json&_marker=0`;

        const response = await fetch(url, { headers: HEADERS });
        let text = await response.text();

        // Clean response
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            return res.status(500).json({
                success: false,
                error: 'Failed to parse response'
            });
        }

        const songIds = ids.split(',');

        if (songIds.length === 1) {
            const rawSong = data[songIds[0]] || Object.values(data)[0];

            if (!rawSong || !rawSong.id) {
                return res.status(404).json({ success: false, error: 'Song not found' });
            }

            const formatted = formatSong(rawSong);

            if (!formatted) {
                return res.status(500).json({ success: false, error: 'Failed to format song' });
            }

            return res.json({ success: true, data: formatted });

        } else {
            const results = Object.values(data)
                .map(formatSong)
                .filter(Boolean);

            return res.json({
                success: true,
                total: results.length,
                data: results
            });
        }

    } catch (error) {
        console.error('Song error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch song: ' + error.message
        });
    }
};