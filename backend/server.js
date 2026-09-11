import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("🎨 Art Curator AI backend is running");
});

// ==========================================
// 🖼️ IMAGE PROXY (Λύνει το 403 Forbidden)
// ==========================================
app.get("/api/proxy-image", async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("Missing url param");

    try {
        const imgRes = await fetch(imageUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        if (!imgRes.ok) {
            return res.status(imgRes.status).send("Failed to fetch upstream image");
        }

        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400"); // Cache 1 ημέρα

        // Στέλνουμε το binary stream της εικόνας κατευθείαν στον client
        imgRes.body.pipe(res);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).send("Proxy error");
    }
});

// ==========================================
// 🎨 ART & AI CURATE ROUTE
// ==========================================
app.post("/api/art-curate", async (req, res) => {
    const { category } = req.body;
    const catQuery = category || "Impressionism";

    try {
        const page = Math.floor(Math.random() * 15) + 1;
        const museumUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(catQuery)}&query[term][is_public_domain]=true&page=${page}&limit=10&fields=id,title,artist_title,image_id`;
        
        const museumRes = await fetch(museumUrl, {
            headers: { "User-Agent": "ArtCuratorBot/1.0" }
        });
        
        if (!museumRes.ok) throw new Error("Museum API failed");
        const museumData = await museumRes.json();
        
        const valid = (museumData.data || []).filter(a => a.image_id);
        if (valid.length === 0) throw new Error("No valid artworks");

        const art = valid[Math.floor(Math.random() * valid.length)];
        const rawImageUrl = `https://www.artic.edu/iiif/2/${art.image_id}/full/843,/0/default.jpg`;
        const title = art.title || "Χωρίς Τίτλο";
        const artist = art.artist_title || "Άγνωστος Καλλιτέχνης";

        // Επιστρέφουμε την εικόνα ΜΕΣΩ του δικού μας proxy endpoint
        const safeImageUrl = `https://art-b2pg.onrender.com/api/proxy-image?url=${encodeURIComponent(rawImageUrl)}`;

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
            imageUrl: safeImageUrl,
            comment: aiText
        });

    } catch (err) {
        console.error("Backend Error:", err);
        res.status(500).json({ error: "Failed to curate artwork", details: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
