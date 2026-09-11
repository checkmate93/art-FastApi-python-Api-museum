import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => {
    res.send("🎨 Art Curator AI backend is running");
});

app.post("/api/art-curate", async (req, res) => {
    const { category } = req.body;
    const catQuery = category || "Impressionism";

    try {
        const page = Math.floor(Math.random() * 10) + 1;
        const museumUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(catQuery)}&query[term][is_public_domain]=true&page=${page}&limit=12&fields=id,title,artist_title,image_id`;
        
        const museumRes = await fetch(museumUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        
        if (!museumRes.ok) throw new Error("Museum API failed");
        const museumData = await museumRes.json();
        
        const valid = (museumData.data || []).filter(a => a.image_id);
        if (valid.length === 0) throw new Error("No valid artworks");

        // Ανακάτεμα για τυχαιότητα
        valid.sort(() => 0.5 - Math.random());

        let finalImageBase64 = null;
        let selectedArt = null;

        // Δοκιμάζουμε να κατεβάσουμε την εικόνα απευθείας σε Buffer
        for (const art of valid) {
            // Μικρότερο μέγεθος (600px) που σερβίρεται ταχύτατα και δεν μπλοκάρεται
            const targetUrl = `https://www.artic.edu/iiif/2/${art.image_id}/full/600,/0/default.jpg`;
            try {
                const imgFetch = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Accept": "image/*"
                    }
                });
                
                if (imgFetch.ok) {
                    const buffer = await imgFetch.arrayBuffer();
                    const b64 = Buffer.from(buffer).toString("base64");
                    finalImageBase64 = `data:image/jpeg;base64,${b64}`;
                    selectedArt = art;
                    break;
                }
            } catch (e) {
                console.warn(`Skip art ${art.id}`);
            }
        }

        // Αν το Chicago μπλοκάρει τις IP, fallback σε εγγυημένο public domain open access
        if (!selectedArt || !finalImageBase64) {
            const fallbackArt = valid[0];
            selectedArt = fallbackArt;
            finalImageBase64 = `https://picsum.photos/800/600?blur=1`; // safe fallback
        }

        const title = selectedArt.title || "Χωρίς Τίτλο";
        const artist = selectedArt.artist_title || "Άγνωστος Καλλιτέχνης";

        // Κλήση Groq AI
        let aiText = "Δεν ήταν δυνατή η φόρτωση ανάλυσης.";
        const apiKey = process.env.GROQ_API_KEY;

        if (apiKey) {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey.trim()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "system",
                            content: `Είσαι κορυφαίος ιστορικός τέχνης, αλλά και ερευνητής σκοτεινών ιστοριών. 
Σκοπός σου είναι να αντλείς πληροφορίες για τα πιο ΣΠΑΝΙΑ, ΠΕΡΙΕΡΓΑ, ΑΣΤΕΙΑ ή ΣΚΟΤΕΙΝΑ περιστατικά πίσω από κάθε πίνακα και τη ζωή του καλλιτέχνη. 
ΜΗΝ γράφεις γενικότητες. Κάνε τον θεατή να εντυπωσιαστεί.
Ξεκινάς πάντα με fun fact, μετά ανάλυση και μετά context.
Διατήρησε επαγγελματικό αλλά μυστηριώδες ύφος.`
                        },
                        {
                            role: "user",
                            content: `Έργο: "${title}"\nΚαλλιτέχνης: "${artist}"\n\n🎯 Fun Fact:\n🎨 Ανάλυση:\n🧠 Context:\n150-200 λέξεις στα ελληνικά.`
                        }
                    ],
                    max_tokens: 800,
                    temperature: 0.8
                })
            });

            const groqData = await groqRes.json();
            if (groqData.choices && groqData.choices[0]) {
                aiText = groqData.choices[0].message.content;
            }
        }

        res.json({
            title,
            artist,
            imageUrl: finalImageBase64, // Η εικόνα επιστρέφει απευθείας έτοιμη μέσα στο JSON!
            comment: aiText
        });

    } catch (err) {
        console.error("Backend Error:", err);
        res.status(500).json({ error: "Failed to curate artwork", details: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
