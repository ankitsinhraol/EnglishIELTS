const fetch = require('node-fetch');
const forge = require('node-forge');

const DES_KEY = '38346591';
const QUALITIES = ['12', '48', '96', '160', '320'];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.jiosaavn.com/',
    'Origin': 'https://www.jiosaavn.com',
    'Cookie': 'L=hindi%2Cenglish%2Cpunjabi%2Ctamil%2Ctelugu'
};

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) return null;
    try {
        let cleanUrl = encryptedUrl.trim();
        while (cleanUrl.length % 4 !== 0) cleanUrl += '=';
        const encrypted = forge.util.decode64(cleanUrl);
        const decipher = forge.cipher.createDecipher('DES-ECB', DES_KEY);
        decipher.start();
        decipher.update(forge.util.createBuffer(encrypted));
        if (!decipher.finish()) return null;
        return decipher.output.toString('utf8');
    } catch (e) {
        return null;
    }
}

function generateDownloadUrls(encryptedMediaUrl, is320) {
    const decryptedUrl = decryptUrl(encryptedMediaUrl);
    if (!decryptedUrl) return [];
    const qualities = is320 ? QUALITIES : QUALITIES.filter(q => q !== '320');
    return qualities.map(q => ({
        quality: q + 'kbps',
        link: decryptedUrl.replace(/_\d+\.mp4/, `_${q}.mp4`).replace(/_\d+\.m4a/, `_${q}.m4a`)
    }));
}

function cleanText(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/<[^>]*>/g, '').trim();
}

function formatSong(song) {
    if (!song || !song.id) return null;
    const baseImage = song.image || '';
    const is320 = song['320kbps'] === 'true';
    return {
        id: song.id,
        name: cleanText(song.song || song.title || ''),
        album: cleanText(song.album || ''),
        year: song.year || '',
        duration: parseInt(song.duration) || 0,
        language: song.language || '',
        artists: {
            primary: cleanText(song.primary_artists || song.singers || ''),
            featured: cleanText(song.featured_artists || ''),
            all: cleanText(song.primary_artists || song.singers || '')
        },
        image: {
            low: baseImage,
            medium: baseImage.replace('150x150', '500x500'),
            high: baseImage.replace('150x150', '500x500')
        },
        downloadUrl: generateDownloadUrls(song.encrypted_media_url, is320),
        hasLyrics: song.has_lyrics === 'true',
        playCount: parseInt(song.play_count) || 0,
        permaUrl: song.perma_url || '',
        albumId: song.albumid || '',
        is320kbps: is320
    };
}

async function fetchJson(url) {
    const response = await fetch(url, { headers: HEADERS });
    let text = await response.text();
    if (text.trim().startsWith('[')) {
        const s = text.indexOf('[');
        const e = text.lastIndexOf(']');
        return JSON.parse(text.substring(s, e + 1));
    }
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s >= 0 && e > s) text = text.substring(s, e + 1);
    return JSON.parse(text);
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { id, limit = 20 } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, error: 'Missing ?id= parameter' });
    }

    // Support multiple IDs for session-based suggestions
    // e.g. ?id=abc,def,ghi — will use last ID for primary reco
    const ids = id.split(',').map(i => i.trim()).filter(Boolean);
    const primaryId = ids[ids.length - 1];
    const allPlayedIds = new Set(ids);

    try {
        let suggestions = [];

        // METHOD 1: Song recommendations
        try {
            const recoUrl = `https://www.jiosaavn.com/api.php?__call=reco.getreco&pid=${primaryId}&_format=json&_marker=0`;
            const recoData = await fetchJson(recoUrl);

            let songList = Array.isArray(recoData) ? recoData : Object.values(recoData);
            suggestions = songList
                .filter(s => s && s.id && !allPlayedIds.has(s.id))
                .map(formatSong)
                .filter(Boolean);
        } catch (e) {
            console.error('Reco failed:', e.message);
        }

        // METHOD 2: Station if reco returned less than 5
        if (suggestions.length < 5) {
            try {
                const stationUrl = `https://www.jiosaavn.com/api.php?__call=webradio.createEntityStation&entity_id=${primaryId}&entity_type=queue&_format=json&_marker=0`;
                const stationData = await fetchJson(stationUrl);
                const stationId = stationData?.stationid || '';

                if (stationId) {
                    const songsUrl = `https://www.jiosaavn.com/api.php?__call=webradio.getSong&stationid=${stationId}&k=${parseInt(limit) + 10}&_format=json&_marker=0`;
                    const songsData = await fetchJson(songsUrl);

                    let stationSongs = Array.isArray(songsData) ? songsData : Object.values(songsData);
                    const stationResults = stationSongs
                        .filter(s => s && s.id && s.song && !allPlayedIds.has(s.id))
                        .map(formatSong)
                        .filter(Boolean);

                    // Merge without duplicates
                    const existingIds = new Set(suggestions.map(s => s.id));
                    stationResults.forEach(s => {
                        if (!existingIds.has(s.id)) {
                            suggestions.push(s);
                            existingIds.add(s.id);
                        }
                    });
                }
            } catch (e) {
                console.error('Station failed:', e.message);
            }
        }

        // METHOD 3: Album songs if still not enough
        if (suggestions.length < 5) {
            try {
                const songUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${primaryId}&_format=json&_marker=0`;
                const songData = await fetchJson(songUrl);
                const song = songData[primaryId] || Object.values(songData)[0];

                if (song && song.albumid) {
                    const albumUrl = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&albumid=${song.albumid}&_format=json&_marker=0`;
                    const albumData = await fetchJson(albumUrl);

                    if (albumData && albumData.list) {
                        const existingIds = new Set(suggestions.map(s => s.id));
                        albumData.list
                            .filter(s => s && s.id && !allPlayedIds.has(s.id) && !existingIds.has(s.id))
                            .map(formatSong)
                            .filter(Boolean)
                            .forEach(s => suggestions.push(s));
                    }
                }
            } catch (e) {
                console.error('Album failed:', e.message);
            }
        }

        suggestions = suggestions.slice(0, parseInt(limit));

        return res.json({
            success: true,
            songId: primaryId,
            basedOn: ids,
            total: suggestions.length,
            results: suggestions
        });

    } catch (error) {
        console.error('Suggest error:', error);
        return res.status(500).json({ success: false, error: 'Failed: ' + error.message });
    }
};