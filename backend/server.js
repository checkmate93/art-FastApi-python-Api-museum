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
        let objectIDs = [];
        
        // 1. Προσπάθεια αναζήτησης στο Met Museum
        try {
            const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(searchTerm)}`;
            const searchRes = await fetch(searchUrl);
            if (searchRes.ok) {
                const searchData = await searchRes.json();
                objectIDs = searchData.objectIDs || [];
            }
        } catch (metErr) {
            console.error("Met Search API connection error:", metErr.message);
        }

        let selectedArt = null;

        // Αν βρήκε αντικείμενα από την αναζήτηση, ψάξε για ένα με έγκυρη εικόνα
        if (objectIDs.length > 0) {
            const shuffled = objectIDs.slice(0, 100).sort(() => 0.5 - Math.random());
            for (let i = 0; i < Math.min(shuffled.length, 25); i++) {
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
        }

        // Αν αποτύχει η αναζήτηση ή δεν βρεθεί εικόνα, φορτώνουμε έναν σίγουρο πίνακα (Fallback)
        if (!selectedArt) {
            console.log("Using fallback artwork...");
            try {
                const fallbackRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/436532`); // Van Gogh - Wheat Field
                if (fallbackRes.ok) {
                    selectedArt = await fallbackRes.json();
                }
            } catch (fallbackErr) {
                console.error("Fallback artwork failed:", fallbackErr.message);
            }
        }

        if (!selectedArt) {
            throw new Error("Could not retrieve any artwork details");
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
                    console.error("OpenAI error response:", openAiData);
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
