const fetch = require('node-fetch');
const crypto = require('crypto');

// ===== DES DECRYPTION =====
const DES_KEY = Buffer.from('38346591', 'utf8');
const QUALITIES = ['12', '48', '96', '160', '320'];

function decryptUrl(encryptedUrl) {
    if (!encryptedUrl) {
        console.log('❌ No encrypted URL provided');
        return null;
    }

    try {
        // Clean the encrypted URL
        let cleanUrl = encryptedUrl.trim();

        // Fix base64 padding if needed
        while (cleanUrl.length % 4 !== 0) {
            cleanUrl += '=';
        }

        console.log('🔐 Attempting decryption...');
        console.log('📝 Encrypted URL length:', cleanUrl.length);
        console.log('📝 First 50 chars:', cleanUrl.substring(0, 50));

        const encryptedBuffer = Buffer.from(cleanUrl, 'base64');
        console.log('📝 Buffer length:', encryptedBuffer.length);

        // DES-ECB decryption
        const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
        decipher.setAutoPadding(true);

        let decrypted = decipher.update(encryptedBuffer, null, 'utf8');
        decrypted += decipher.final('utf8');

        console.log('✅ Decrypted URL:', decrypted);

        if (!decrypted || decrypted.length < 10) {
            console.log('❌ Decrypted URL too short');
            return null;
        }

        return decrypted;

    } catch (e) {
        console.error('❌ Decryption failed:', e.message);

        // Try alternative: sometimes the URL needs URL decoding first
        try {
            const urlDecoded = decodeURIComponent(encryptedUrl.trim());
            let cleanUrl = urlDecoded;
            while (cleanUrl.length % 4 !== 0) {
                cleanUrl += '=';
            }

            const encryptedBuffer = Buffer.from(cleanUrl, 'base64');
            const decipher = crypto.createDecipheriv('des-ecb', DES_KEY, null);
            decipher.setAutoPadding(true);

            let decrypted = decipher.update(encryptedBuffer, null, 'utf8');
            decrypted += decipher.final('utf8');

            console.log('✅ Decrypted URL (after URL decode):', decrypted);
            return decrypted;

        } catch (e2) {
            console.error('❌ Second attempt also failed:', e2.message);
            return null;
        }
    }
}

function generateDownloadUrls(encryptedMediaUrl, is320) {
    const decryptedUrl = decryptUrl(encryptedMediaUrl);
    if (!decryptedUrl) return [];

    // Decrypted URL comes with _96.mp4 by default
    // Generate all quality variants
    const qualities = is320 ? QUALITIES : QUALITIES.filter(q => q !== '320');

    return qualities.map(q => ({
        quality: q + 'kbps',
        link: decryptedUrl
            .replace(/_96\.mp4/, `_${q}.mp4`)
            .replace(/_96\.m4a/, `_${q}.m4a`)
            .replace(/_96_p\.mp4/, `_${q}.mp4`)
            .replace(/_96_p\.m4a/, `_${q}.m4a`)
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

    console.log(`\n🎵 Processing: ${rawSong.song || rawSong.title}`);
    console.log(`🔑 encrypted_media_url exists: ${!!rawSong.encrypted_media_url}`);
    console.log(`🔑 encrypted_media_url: ${rawSong.encrypted_media_url?.substring(0, 60)}...`);

    const downloadUrl = generateDownloadUrls(rawSong.encrypted_media_url, is320);

    console.log(`📦 Generated ${downloadUrl.length} download URLs`);
    if (downloadUrl.length > 0) {
        console.log(`📦 First URL: ${downloadUrl[0].link}`);
    }

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

        console.log('\n========================================');
        console.log('🔍 Fetching song:', ids);

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
            console.error('❌ JSON parse error');
            return res.status(500).json({
                success: false,
                error: 'Failed to parse response',
                debug: text.substring(0, 300)
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

            // DO NOT fallback to preview URL
            // If decryption failed, return empty downloadUrl
            // Frontend will show proper error

            return res.json({
                success: true,
                data: formatted,
                // Include debug info temporarily
                _debug: {
                    hasEncryptedUrl: !!rawSong.encrypted_media_url,
                    encryptedUrlLength: rawSong.encrypted_media_url?.length || 0,
                    downloadUrlCount: formatted.downloadUrl.length,
                    decryptionWorked: formatted.downloadUrl.length > 0
                }
            });

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