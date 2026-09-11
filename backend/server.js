const express = require('express');
const cors = require('cors');
const { Groq } = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 10000;

// Ενεργοποίηση CORS για να επιτρέπονται κλήσεις από το GitHub Pages
app.use(cors({
  origin: '*'
}));

app.use(express.json());

// Αρχικοποίηση του Groq client με το API key από το Environment
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Endpoint ελέγχου λειτουργίας (Health check)
app.get('/', (req, res) => {
  res.send('Art Curator Backend is Running!');
});

// Endpoint σχολιασμού έργου τέχνης
app.post('/api/curate', async (req, res) => {
  try {
    const { title, artist } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Missing artwork title" });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Είσαι ένας έμπειρος ιστορικός τέχνης και επιμελητής μουσείου. Γράψε ένα σύντομο, ενδιαφέρον σχόλιο 2-3 προτάσεων στα ελληνικά για το παρακάτω έργο τέχνης."
        },
        {
          role: "user",
          content: `Έργο: "${title}", Καλλιτέχνης: "${artist || 'Άγνωστος'}"`
        }
      ],
      // Χρήση ενεργού, έγκυρου μοντέλου της Groq
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 150
    });

    const comment = completion.choices[0]?.message?.content || "Δεν υπάρχει διαθέσιμο σχόλιο.";
    res.json({ comment });

  } catch (error) {
    console.error("Groq API Error:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      details: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
