import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "25mb" }));

app.get("/", (req, res) => {
    res.send("🎨 Art Curator AI backend is running with OpenAI");
});

app.post("/api/art-curate", async (req, res) => {
    const { category } = req.body;
    const catQuery = category || "Impressionism";

    try {
        // 1. Chicago Museum Artworks Search
        const page = Math.floor(Math.random() * 10) + 1;
        const museumUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(catQuery)}&query[term][is_public_domain]=true&page=${page}&limit=12&fields=id,title,artist_title,image_id`;
        
        const museumRes = await fetch(museumUrl, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        
        if (!museumRes.ok) throw new Error("Museum API failed");
        const museumData = await museumRes.json();
        
        const valid = (museumData.data || []).filter(a => a.image_id);
        if (valid.length === 0) throw new Error("No valid artworks");

        valid.sort(() => 0.5 - Math.random());

        let finalImageBase64 = null;
        let selectedArt = null;

        // 2. Fetch Image και μετατροπή σε Base64 για να μην υπάρχει ποτέ θέμα 403 / CORB
        for (const art of valid) {
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

        if (!selectedArt || !finalImageBase64) {
            selectedArt = valid[0];
            finalImageBase64 = `https://picsum.photos/800/600?blur=1`;
        }

        const title = selectedArt.title || "Χωρίς Τίτλο";
        const artist = selectedArt.artist_title || "Άγνωστος Καλλιτέχνης";

        // 3. Κλήση OpenAI API (gpt-4o-mini)
        let aiText = "Δεν ήταν δυνατή η φόρτωση ανάλυσης.";
        const rawKey = process.env.OPENAI_API_KEY || "";
        const apiKey = rawKey.trim();

        if (!apiKey) {
            console.error("OPENAI_API_KEY is not defined in environment variables!");
        } else {
            try {
                const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: "Είσαι κορυφαίος ιστορικός τέχνης και ερευνητής σκοτεινών ιστοριών. Γράψε ένα ενδιαφέρον, συναρπαστικό σχόλιο στα ελληνικά με τα εξής μέρη: 🎯 Fun Fact, 🎨 Ανάλυση, 🧠 Context (συνολικά 120-160 λέξεις)."
                            },
                            {
                                role: "user",
                                content: `Πίνακας: "${title}", Καλλιτέχνης: "${artist}"\n🎯 Fun Fact:\n🎨 Ανάλυση:\n🧠 Context:`
                            }
                        ],
                        max_tokens: 600,
                        temperature: 0.7
                    })
                });

                const openAiData = await openAiRes.json();
                
                if (openAiRes.ok && openAiData.choices && openAiData.choices[0]) {
                    aiText = openAiData.choices[0].message.content;
                } else {
                    console.error("OpenAI API error response:", JSON.stringify(openAiData));
                }
            } catch (aiErr) {
                console.error("OpenAI network request failed:", aiErr);
            }
        }

        res.json({
            title,
            artist,
            imageUrl: finalImageBase64,
            comment: aiText
        });

    } catch (err) {
        console.error("Backend Error:", err);
        res.status(500).json({ error: "Failed to curate artwork", details: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
