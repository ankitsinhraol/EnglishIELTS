const fetch = require('node-fetch');
const crypto = require('crypto');

// ===== DES DECRYPTION =====
// Key is 8 bytes, DES-ECB mode, PKCS5 padding
const DES_KEY = Buffer.from('38346591', 'utf8');

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;
    try {
        const encrypted = Buffer.from(encryptedUrl, 'base64');
        const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('Decryption error:', e.message);
        return null;
    }
}

function generateDownloadUrls(encryptedMediaUrl, is320) {
    const decryptedUrl = decryptUrl(encryptedMediaUrl);
    if (!decryptedUrl) return [];

    // Decrypted URL comes with _96.mp4 by default
    // Replace _96 with each quality variant
    const qualities = ['12', '48', '96', '160', '320'];

    // If song doesn't support 320kbps, exclude it
    const finalQualities = is320 ? qualities : qualities.filter(q => q !== '320');

    return finalQualities.map(q => ({
        quality: q + 'kbps',
        link: decryptedUrl.replace('_96.mp4', `_${q}.mp4`)
                          .replace('_96.m4a', `_${q}.m4a`)
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

function formatSong(song) {
    if (!song || typeof song !== 'object' || !song.id) return null;

    const baseImage = song.image || '';
    const is320 = song['320kbps'] === 'true';

    const downloadUrl = generateDownloadUrls(song.encrypted_media_url, is320);

    return {
        id: song.id,
        name: cleanText(song.song || song.title || ''),
        album: cleanText(song.album || ''),
        year: song.year || '',
        duration: parseInt(song.duration) || 0,
        language: song.language || '',
        label: cleanText(song.label || ''),
        artists: {
            primary: cleanText(song.primary_artists || song.singers || ''),
            featured: cleanText(song.featured_artists || ''),
            music: cleanText(song.music || ''),
            all: cleanText(song.primary_artists || song.singers || '')
        },
        image: {
            low: baseImage,
            medium: baseImage.replace('150x150', '500x500'),
            high: baseImage.replace('150x150', '500x500')
        },
        downloadUrl: downloadUrl,
        hasLyrics: song.has_lyrics === 'true',
        playCount: parseInt(song.play_count) || 0,
        copyright: song.copyright_text || '',
        permaUrl: song.perma_url || '',
        albumId: song.albumid || '',
        albumUrl: song.album_url || '',
        releaseDate: song.release_date || '',
        is320kbps: is320,
        explicit: song.explicit_content === 1,
        disabled: song.disabled === 'true',
        disabledReason: song.disabled_text || song.rights?.reason || '',
        previewUrl: song.media_preview_url || ''
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
                error: 'Failed to parse response',
                debug: text.substring(0, 300)
            });
        }

        const songIds = ids.split(',');

        if (songIds.length === 1) {
            const song = data[songIds[0]] || Object.values(data)[0];

            if (!song || !song.id) {
                return res.status(404).json({ success: false, error: 'Song not found' });
            }

            const formatted = formatSong(song);

            if (!formatted) {
                return res.status(500).json({ success: false, error: 'Failed to format song' });
            }

            // Last resort: preview URL
            if (formatted.downloadUrl.length === 0 && song.media_preview_url) {
                formatted.downloadUrl = [{
                    quality: 'preview',
                    link: song.media_preview_url
                }];
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