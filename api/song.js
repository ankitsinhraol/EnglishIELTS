const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const DECRYPT_KEY = CryptoJS.enc.Utf8.parse('3834659127733675');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'Cookie': 'L=punjabi%2Chindi%2Cenglish%2Ctamil%2Ctelugu'
};

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;
    try {
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
            DECRYPT_KEY,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        const result = decrypted.toString(CryptoJS.enc.Utf8);
        return result || null;
    } catch (e) {
        return null;
    }
}

function getDownloadUrls(encryptedUrl, is320) {
    const decrypted = decryptUrl(encryptedUrl);
    if (!decrypted) return [];

    const qualities = is320
        ? ['48', '96', '160', '320']
        : ['48', '96', '160'];

    return qualities.map(q => ({
        quality: q + 'kbps',
        url: decrypted.replace(/_\d+\.mp4$/, `_${q}.mp4`)
                       .replace(/_\d+\.m4a$/, `_${q}.m4a`)
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

function formatSong(song) {
    if (!song || typeof song !== 'object') return null;

    // Handle image URLs for different sizes
    const baseImage = song.image || '';
    const imageLow = baseImage;
    const imageMed = baseImage.replace('150x150', '500x500');
    const imageHigh = baseImage.replace('150x150', '500x500');

    const is320 = song['320kbps'] === 'true';

    return {
        id: song.id || '',
        name: cleanText(song.song || song.title || ''),
        album: cleanText(song.album || ''),
        year: song.year || '',
        duration: parseInt(song.duration) || 0,
        language: song.language || '',
        label: cleanText(song.label || ''),
        artists: {
            primary: cleanText(song.primary_artists || song.singers || ''),
            featured: cleanText(song.featured_artists || ''),
            music: cleanText(song.music || '')
        },
        image: {
            low: imageLow,
            medium: imageMed,
            high: imageHigh
        },
        downloadUrl: getDownloadUrls(song.encrypted_media_url, is320),
        hasLyrics: song.has_lyrics === 'true',
        playCount: parseInt(song.play_count) || 0,
        copyright: song.copyright_text || '',
        permaUrl: song.perma_url || '',
        albumId: song.albumid || '',
        albumUrl: song.album_url || '',
        releaseDate: song.release_date || '',
        is320kbps: is320,
        isDRM: song.is_drm === 1,
        disabled: song.disabled === 'true',
        disabledReason: song.disabled_text || song.rights?.reason || '',
        previewUrl: song.media_preview_url || '',
        explicit: song.explicit_content === 1
    };
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id } = req.query;

    if (!id) {
        return res.status(400).json({
            success: false,
            error: 'Missing ?id= parameter. Usage: /api/song?id=SONG_ID'
        });
    }

    try {
        // Support multiple IDs separated by comma
        const ids = id.replace(/\s/g, '');

        const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${ids}&_format=json&_marker=0`;
        const response = await fetch(url, { headers: HEADERS });
        let text = await response.text();

        // Clean response - JioSaavn sometimes prepends garbage
        const jsonStart = text.indexOf('{');
        if (jsonStart > 0) text = text.substring(jsonStart);

        // Sometimes response ends with extra characters
        const jsonEnd = text.lastIndexOf('}');
        if (jsonEnd > 0 && jsonEnd < text.length - 1) {
            text = text.substring(0, jsonEnd + 1);
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            console.error('Parse error:', parseErr.message);
            console.error('Raw text (first 500):', text.substring(0, 500));
            return res.status(500).json({
                success: false,
                error: 'Failed to parse JioSaavn response'
            });
        }

        // Handle single song vs multiple songs
        const songIds = ids.split(',');

        if (songIds.length === 1) {
            // Single song request
            const song = data[songIds[0]] || Object.values(data)[0];

            if (!song || !song.id) {
                return res.status(404).json({
                    success: false,
                    error: 'Song not found'
                });
            }

            const formatted = formatSong(song);

            if (!formatted) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to format song data'
                });
            }

            // Check if we got stream URLs
            if (formatted.downloadUrl.length === 0) {
                // Try with encrypted_drm_media_url as fallback
                if (song.encrypted_drm_media_url) {
                    const drmUrls = getDownloadUrls(
                        song.encrypted_drm_media_url,
                        song['320kbps'] === 'true'
                    );
                    if (drmUrls.length > 0) {
                        formatted.downloadUrl = drmUrls;
                    }
                }

                // If still no URLs, provide preview URL
                if (formatted.downloadUrl.length === 0 && song.media_preview_url) {
                    formatted.downloadUrl = [{
                        quality: 'preview',
                        url: song.media_preview_url
                    }];
                }
            }

            return res.json({
                success: true,
                data: formatted
            });

        } else {
            // Multiple songs request
            const results = [];

            for (const sid of songIds) {
                const song = data[sid];
                if (song) {
                    const formatted = formatSong(song);
                    if (formatted) {
                        if (formatted.downloadUrl.length === 0 && song.media_preview_url) {
                            formatted.downloadUrl = [{
                                quality: 'preview',
                                url: song.media_preview_url
                            }];
                        }
                        results.push(formatted);
                    }
                }
            }

            return res.json({
                success: true,
                total: results.length,
                data: results
            });
        }

    } catch (error) {
        console.error('Song fetch error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch song: ' + error.message
        });
    }
};