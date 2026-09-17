const htmlPdf = require('html-pdf-node');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ error: 'Méthode non autorisée' }) 
        };
    }

    try {
        // 1. Récupération des données du formulaire
        const donnees = JSON.parse(event.body || '{}');

        // 2. Chargement du modèle HTML
        const htmlPath = path.join(__dirname, 'Synthese_UVIH_ACR.html');
        if (!fs.existsSync(htmlPath)) {
            throw new Error(`Le fichier modèle HTML est introuvable au chemin : ${htmlPath}`);
        }
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // 3. Remplacement des balises {{clé}} par les valeurs du questionnaire
        // On parcourt chaque donnée envoyée et on remplace dans le HTML
        Object.keys(donnees).forEach(key => {
            const val = donnees[key] !== undefined && donnees[key] !== null ? donnees[key] : '';
            const regExp = new RegExp(`{{${key}}}`, 'g');
            htmlContent = htmlContent.replace(regExp, String(val));
        });

        // Nettoyage des balises non remplies (remplacées par du vide)
        htmlContent = htmlContent.replace(/{{[a-zA-Z0-9_-]+}}/g, '');

        // 4. Conversion du HTML en PDF
        const options = { format: 'A4', printBackground: true };
        const file = { content: htmlContent };
        const pdfBuffer = await htmlPdf.generatePdf(file, options);

        // 5. Configuration de l'envoi d'e-mail (SMTP)
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // 6. Envoi du mail avec le PDF généré en pièce jointe
        const nomUtilisateur = donnees['input-nom-prenom'] || 'Nouvelle_Soumission';
        const dateSoumission = donnees['input-date'] || new Date().toISOString().split('T')[0];

        await transporter.sendMail({
            from: `"Synthèse UVIH" <${process.env.SMTP_USER}>`,
            to: process.env.MON_EMAIL_RECEPTION,
            subject: `Synthèse UVIH - ${nomUtilisateur} (${dateSoumission})`,
            text: `Veuillez trouver ci-joint la synthèse au format PDF transmise le ${dateSoumission}.`,
            attachments: [
                {
                    filename: `Synthese_UVIH_${dateSoumission}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "PDF généré à partir du HTML et envoyé avec succès !" })
        };

    } catch (error) {
        console.error('Erreur lors du traitement PDF/Mail :', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: "Erreur lors de la génération ou de l'envoi du PDF", 
                details: error.message 
            })
        };
    }
};
