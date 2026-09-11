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

// Χαρτογράφηση κατηγοριών σε όρους με άφθονους πίνακες στο Met Museum
const CATEGORY_MAP = {
    "Impressionism": "Monet OR Renoir OR Degas OR Impressionism",
    "Renaissance": "Renaissance painting OR Botticelli OR Raphael OR Titian",
    "Ancient Greek": "Greek antiquity OR Greek vase OR classical art",
    "Japanese Art": "Japanese print OR Hokusai OR Hiroshige OR Ukiyo-e",
    "Japanese": "Japanese print OR Hokusai OR Hiroshige OR Ukiyo-e",
    "Greek": "Greek antiquity OR Greek vase OR classical art",
    "Surrealism": "Modern painting OR Symbolism OR Fantastical"
};

app.post("/api/art-curate", async (req, res) => {
    const { category } = req.body;
    const searchTerm = CATEGORY_MAP[category] || category || "Impressionism";

    try {
        // 1. Αναζήτηση στο Met Museum ΜΟΝΟ για έργα με εικόνα
        const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(searchTerm)}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error("Met search request failed");
        
        const searchData = await searchRes.json();
        const objectIDs = searchData.objectIDs || [];

        if (objectIDs.length === 0) {
            throw new Error(`No items found for category ${category}`);
        }

        // Ανακάτεμα των IDs για να παίρνουμε κάθε φορά διαφορετικό έργο
        const shuffled = objectIDs.slice(0, 100).sort(() => 0.5 - Math.random());
        let selectedArt = null;

        // Ψάχνουμε μέχρι να βρούμε έργο με έγκυρη εικόνα
        for (let i = 0; i < Math.min(shuffled.length, 15); i++) {
            const id = shuffled[i];
            try {
                const itemRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
                if (itemRes.ok) {
                    const item = await itemRes.json();
                    const validImg = item.primaryImageSmall || item.primaryImage;
                    if (validImg && validImg.startsWith("http")) {
                        selectedArt = item;
                        break;
                    }
                }
            } catch (e) {
                // Συνέχιση στο επόμενο
            }
        }

        if (!selectedArt) {
            throw new Error("Could not find an artwork with public image");
        }

        const title = selectedArt.title || "Χωρίς Τίτλο";
        const artist = selectedArt.artistDisplayName || selectedArt.culture || "Άγνωστος Καλλιτέχνης";
        const imageUrl = selectedArt.primaryImageSmall || selectedArt.primaryImage;

        // 2. OpenAI Ανάλυση (gpt-4o-mini)
        let aiText = "Δεν ήταν δυνατή η φόρτωση ανάλυσης.";
        const apiKey = (process.env.OPENAI_API_KEY || "").trim();

        if (apiKey) {
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
                                content: "Είσαι κορυφαίος ιστορικός τέχνης. Γράψε ένα καθηλωτικό σχόλιο στα ελληνικά με τα εξής μέρη: 🎯 Fun Fact, 🎨 Ανάλυση, 🧠 Context (συνολικά 110-140 λέξεις)."
                            },
                            {
                                role: "user",
                                content: `Πίνακας/Έργο: "${title}", Δημιουργός/Πολιτισμός: "${artist}"\n🎯 Fun Fact:\n🎨 Ανάλυση:\n🧠 Context:`
                            }
                        ],
                        max_tokens: 500,
                        temperature: 0.7
                    })
                });

                const openAiData = await openAiRes.json();
                if (openAiRes.ok && openAiData.choices && openAiData.choices[0]) {
                    aiText = openAiData.choices[0].message.content;
                } else {
                    console.error("OpenAI error:", openAiData);
                }
            } catch (openAiErr) {
                console.error("OpenAI fetch failed:", openAiErr);
            }
        }

        res.json({
            title,
            artist,
            imageUrl,
            comment: aiText
        });

    } catch (err) {
        console.error("Curate Error:", err);
        res.status(500).json({ error: "Failed to fetch artwork", details: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
