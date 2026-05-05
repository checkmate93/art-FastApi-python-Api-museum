import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("🎨 Art Curator AI backend is running");
});

app.post("/api/groq", async (req, res) => {
    const { title, artist } = req.body;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `
Είσαι κορυφαίος ιστορικός τέχνης.
Ξεκινάς πάντα με fun fact, μετά ανάλυση και μετά context.
Δεν γράφεις γενικότητες.
`
                    },
                    {
                        role: "user",
                        content: `
Έργο: "${title}"
Καλλιτέχνης: "${artist}"

🎯 Fun Fact:
🎨 Ανάλυση:
🧠 Context:
150-220 λέξεις
`
                    }
                ],
                max_tokens: 900,
                temperature: 0.85
            })
        });

        const data = await response.json();
        res.json(data);

    } catch (err) {
        res.status(500).json({ error: "AI error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
