# StoryForge Autonomous Agent 3.0

Fertiger Full-Stack-Prototyp für den gewünschten Workflow:

Short/Longform + Nische + optionales Thema
-> Gemini 3.8 Flash plant den Content
-> Gemini 3.1 Flash Image erzeugt 9:16-Bilder
-> Gemini 3.8 Flash TTS erzeugt deutsches Voiceover
-> FFmpeg animiert Bilder mit Zoom/Pan und rendert MP4
-> Job-System speichert den Fortschritt
-> Browser pollt den Jobstatus und übersteht kurze Verbindungsabbrüche
-> nur das fertige Video wird angezeigt

WICHTIG:
Das Backend benötigt `GEMINI_API_KEY` als Server-Secret/Environment Variable.
Den Key NICHT in den Chat posten und NICHT in Frontend-Code eintragen.

Lokal:
1. Node.js 20+
2. npm install
3. GEMINI_API_KEY als Umgebungsvariable setzen
4. npm start
5. http://localhost:3000

Deployment:
Der Ordner enthält ein Dockerfile und kann auf einen Node/Docker-fähigen Server mit dauerhaftem Prozess deployed werden. Für öffentliche Nutzung muss die Job-/Dateispeicherung zusätzlich persistent gemacht werden.

Aktuelle Google API-Implementierung:
- @google/genai Interactions API
- gemini-3.8-flash
- gemini-3.1-flash-image
- gemini-3.8-flash-tts
