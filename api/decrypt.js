const CryptoJS = require('crypto-js');

const DECRYPT_KEY = CryptoJS.enc.Utf8.parse('3834659127733675');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing encrypted URL. Use ?url=ENCRYPTED_URL' 
        });
    }

    try {
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(url) },
            DECRYPT_KEY,
            {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const result = decrypted.toString(CryptoJS.enc.Utf8);

        if (!result) {
            return res.status(400).json({ 
                success: false, 
                error: 'Decryption failed' 
            });
        }

        const urls = ['48', '96', '160', '320'].map(quality => ({
            quality: quality + 'kbps',
            url: result.replace(/_\d+\.mp4/, `_${quality}.mp4`)
                       .replace(/_\d+\.m4a/, `_${quality}.m4a`)
        }));

        return res.status(200).json({
            success: true,
            decryptedUrl: result,
            allQualities: urls
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            error: 'Decryption failed' 
        });
    }
};