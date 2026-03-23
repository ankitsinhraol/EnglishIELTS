const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');

const DECRYPT_KEY = CryptoJS.enc.Utf8.parse('3834659127733675');

function decryptUrl(encryptedUrl) {
    try {
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
            DECRYPT_KEY,
            {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        return null;
    }
}

function getDownloadUrls(encryptedUrl) {
    const decrypted = decryptUrl(encryptedUrl);
    if (!decrypted) return [];

    return ['48', '96', '160', '320'].map(quality => ({
        quality: quality + 'kbps',
        url: decrypted.replace(/_\d+\.mp4/, `_${quality}.mp4`)
                       .replace(/_\d+\.m4a/, `_${quality}.m4a`)
    }));
}

function cleanText(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'")
               .replace(/<[^>]*>/g, '');
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com'
};

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { q, limit = 20, page = 1 } = req.query;

    if (!q) {
        return res.status(400).json({
            success: false,
            error: 'Missing search query. Use ?q=song+name'
        });
    }

    try {
        // ===== STEP 1: Search to get song IDs =====
        const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&q=${encodeURIComponent(q)}&n=${limit}&p=${page}`;

        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        let searchText = await searchRes.text();

        // JioSaavn sometimes returns weird response, clean it
        // Remove anything before the first { 
        const jsonStart = searchText.indexOf('{');
        if (jsonStart > 0) {
            searchText = searchText.substring(jsonStart);
        }

        let searchData;
        try {
            searchData = JSON.parse(searchText);
        } catch (e) {
            return res.status(500).json({
                success: false,
                error: 'Failed to parse search response'
            });
        }

        if (!searchData.results || searchData.results.length === 0) {
            return res.status(200).json({
                success: true,
                results: [],
                total: 0
            });
        }

        // ===== STEP 2: Get all song IDs =====
        const songIds = searchData.results.map(song => song.id).join(',');

        // ===== STEP 3: Fetch FULL details for ALL songs =====
        const detailsUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${songIds}&_format=json&_marker=0`;

        const detailsRes = await fetch(detailsUrl, { headers: HEADERS });
        let detailsText = await detailsRes.text();

        // Clean response
        const detailsJsonStart = detailsText.indexOf('{');
        if (detailsJsonStart > 0) {
            detailsText = detailsText.substring(detailsJsonStart);
        }

        let detailsData;
        try {
            detailsData = JSON.parse(detailsText);
        } catch (e) {
            return res.status(500).json({
                success: false,
                error: 'Failed to parse song details'
            });
        }

        // ===== STEP 4: Format all songs with full data =====
        const songs = Object.values(detailsData).map(song => {
            if (!song || !song.id) return null;

            return {
                id: song.id,
                name: cleanText(song.song || song.title),
                album: cleanText(song.album),
                year: song.year,
                duration: song.duration,
                language: song.language,
                artists: cleanText(song.primary_artists || song.singers),
                featuredArtists: cleanText(song.featured_artists),
                image: {
                    low: song.image?.replace('150x150', '150x150') || '',
                    medium: song.image?.replace('150x150', '500x500') || '',
                    high: song.image?.replace('150x150', '500x500') || ''
                },
                downloadUrl: getDownloadUrls(song.encrypted_media_url),
                hasLyrics: song.has_lyrics === 'true',
                playCount: parseInt(song.play_count) || 0,
                albumId: song.albumid,
                label: song.label,
                copyright: song.copyright_text,
                permaUrl: song.perma_url,
                is320kbps: song['320kbps'] === 'true',
                releaseDate: song.release_date,
                disabled: song.disabled === 'true'
            };
        }).filter(Boolean);

        return res.status(200).json({
            success: true,
            query: q,
            total: searchData.total || songs.length,
            results: songs
        });

    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({
            success: false,
            error: 'Search failed: ' + error.message
        });
    }
};