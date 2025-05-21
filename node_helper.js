/* Magic Mirror
 * Module: MMM-DailyRecipes (KI-gesteuert)
 * Node Helper with AI Integration
 *
 * By Assistant
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const https = require("https");

module.exports = NodeHelper.create({
    
    // KI-Provider Konfigurationen
    aiProviders: {
        openai: {
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-4",
            maxTokens: 2000
        },
        anthropic: {
            baseUrl: "https://api.anthropic.com/v1", 
            model: "claude-3-sonnet-20240229",
            maxTokens: 2000
        },
        ollama: {
            baseUrl: "http://localhost:11434/api",
            model: "llama2",
            maxTokens: 2000
        }
    },
    
    userProfile: {},
    learnedPreferences: {},
    recipeCache: [],
    weatherCache: {},
    
    socketNotificationReceived: function(notification, payload) {
        switch(notification) {
            case "GENERATE_AI_RECIPE":
                this.generateAIRecipe(payload);
                break;
            case "UPDATE_USER_LEARNING":
                this.updateUserLearning(payload);
                break;
            case "REQUEST_WEATHER_DATA":
                this.getWeatherData(payload.location);
                break;
            case "LOAD_USER_PROFILE":
                this.loadUserProfile();
                break;
            case "SAVE_USER_PROFILE":
                this.saveUserProfile(payload);
                break;
            case "GENERATE_SHOPPING_LIST":
                this.generateShoppingList(payload.recipe);
                break;
        }
    },

    generateAIRecipe: async function(context) {
        try {
            console.log("🤖 Generiere KI-Rezept...", context.date);
            
            // Baue den KI-Prompt
            const prompt = this.buildRecipePrompt(context);
            
            // Rufe KI-API auf
            const aiResponse = await this.callAI(prompt, context.aiProvider || "openai", context.apiKey);
            
            // Parse und validiere die Antwort
            const recipe = this.parseAIRecipe(aiResponse, context);
            
            // Generiere Bild (optional)
            if (context.generateImage) {
                recipe.imageUrl = await this.generateRecipeImage(recipe.title, context);
            }
            
            // Cache das Rezept
            this.cacheRecipe(recipe, context);
            
            console.log("✅ KI-Rezept generiert:", recipe.title);
            this.sendSocketNotification("AI_RECIPE_GENERATED", { recipe: recipe });
            
        } catch (error) {
            console.error("❌ KI-Rezept Generation Fehler:", error);
            this.sendSocketNotification("AI_ERROR", { 
                message: error.message,
                fallback: true 
            });
        }
    },

    buildRecipePrompt: function(context) {
        const { userProfile, learnedPreferences, weather, season, dayOfWeek } = context;
        
        // Basis-Prompt mit Kontext
        let prompt = `Du bist ein hochqualifizierter Koch-KI-Assistent. Generiere ein personalisiertes Rezept als JSON.

KONTEXT:
- Datum: ${context.date} (${dayOfWeek})
- Saison: ${season}
- Region: ${context.region}
- Sprache: ${context.language}
- Haushaltsgröße: ${context.householdSize} Personen
- Verfügbare Zeit: ${context.maxCookingTime} Minuten
- Budget: ${context.budgetLevel}
- Kreativitätslevel: ${context.creativityLevel}/1.0

`;

        // Wetter-Kontext
        if (weather) {
            prompt += `WETTER:
- Temperatur: ${weather.temperature}°C
- Bedingungen: ${weather.condition}
- Empfehlung: ${weather.temperature > 25 ? 'Leichte, erfrischende Gerichte' : weather.temperature < 5 ? 'Warme, herzhafte Gerichte' : 'Moderate Gerichte'}

`;
        }

        // Nutzer-Präferenzen
        if (userProfile.dietaryRestrictions && userProfile.dietaryRestrictions.length > 0) {
            prompt += `DIÄTETISCHE EINSCHRÄNKUNGEN:
${userProfile.dietaryRestrictions.map(r => `- ${r}`).join('\n')}

`;
        }

        // Gelernte Präferenzen
        if (Object.keys(learnedPreferences).length > 0) {
            prompt += `GELERNTE PRÄFERENZEN (aus vergangenen Bewertungen):
${Object.entries(learnedPreferences).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

`;
        }

        // Küchen-Präferenzen
        if (userProfile.cuisinePreferences && userProfile.cuisinePreferences.length > 0) {
            prompt += `BEVORZUGTE KÜCHEN:
${userProfile.cuisinePreferences.map(c => `- ${c}`).join('\n')}

`;
        }

        // Saisonale Zutaten
        const seasonalIngredients = this.getSeasonalIngredients(season, context.region);
        if (seasonalIngredients.length > 0) {
            prompt += `SAISONALE ZUTATEN (bevorzugt verwenden):
${seasonalIngredients.join(', ')}

`;
        }

        // Kochfähigkeiten
        prompt += `KOCH-NIVEAU: ${userProfile.cookingSkillLevel}
`;

        // Nachhaltigkeit
        if (context.considerSustainability) {
            prompt += `NACHHALTIGKEIT: Bevorzuge regionale, saisonale und umweltfreundliche Zutaten.
`;
        }

        // JSON-Schema
        prompt += `
AUSGABE-FORMAT (strikt als JSON):
{
    "title": "Vollständiger Rezepttitel",
    "description": "Kurze appetitliche Beschreibung",
    "cookingTime": Minuten als Zahl,
    "difficulty": "easy|medium|hard",
    "confidence": Zahl von 0-100 (wie sicher bist du, dass es gefällt),
    "recommendationReason": "Warum empfiehlst du dieses Rezept heute?",
        "personalizationFactors": {
        "weather": "Wetteranpassung falls zutreffend",
        "season": "Saisonaler Aspekt",
        "time": "Zeitanpassung (Wochentag/Uhrzeit)",
        "preference": "Berücksichtigte Präferenz"
    },
    "ingredients": [
        {
            "text": "Vollständige Zutat mit Menge",
            "seasonal": boolean,
            "alternative": "Optional: Alternative falls nicht verfügbar"
        }
    ],
    "instructions": [
        {
            "text": "Detaillierte Anweisung",
            "time": "Geschätzte Zeit für diesen Schritt in Minuten",
            "tip": "Optional: Hilfreicher Kochtipp"
        }
    ],
    "nutrition": {
        "calories": Zahl pro Portion,
        "protein": Zahl in Gramm,
        "carbs": Zahl in Gramm,
        "fat": Zahl in Gramm,
        "fiber": Zahl in Gramm
    },
    "tags": ["vegetarisch", "schnell", "gesund", etc.],
    "seasonal": boolean,
    "sustainable": boolean,
    "isCreative": boolean,
    "estimatedCost": "low|medium|high",
    "weatherContext": {
        "temperature": ${weather?.temperature || 20},
        "condition": "${weather?.condition || 'mild'}"
    }
}

WICHTIGE REGELN:
1. Antworte NUR mit dem JSON-Objekt, keine zusätzlichen Texte
2. Alle Mengenangaben in deutsche/europäische Formate (g, ml, EL, TL)
3. Realistische Kochzeiten und Portionen
4. Berücksichtige ALLE gegebenen Einschränkungen
5. Sei kreativ aber praktikabel
6. Deutsche Zutatennamen und Anweisungen bei language: "de"
7. Ernährungswerte realistisch schätzen
`;

        return prompt;
    },

    callAI: async function(prompt, provider = "openai", apiKey) {
        const config = this.aiProviders[provider];
        if (!config) {
            throw new Error(`Unbekannter AI Provider: ${provider}`);
        }

        const requestData = this.buildAIRequest(prompt, provider, config);
        
        return new Promise((resolve, reject) => {
            const url = new URL(this.getAIEndpoint(provider, config));
            
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify(requestData)),
                    ...this.getAIHeaders(provider, apiKey)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        const content = this.extractAIContent(response, provider);
                        resolve(content);
                    } catch (error) {
                        reject(new Error(`AI Response Parse Error: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`AI API Error: ${error.message}`));
            });

            req.write(JSON.stringify(requestData));
            req.end();
        });
    },

    buildAIRequest: function(prompt, provider, config) {
        switch(provider) {
            case "openai":
                return {
                    model: config.model,
                    messages: [
                        {
                            role: "system",
                            content: "Du bist ein erfahrener Koch-AI der personalisierte Rezepte als JSON generiert."
                        },
                        {
                            role: "user", 
                            content: prompt
                        }
                    ],
                    max_tokens: config.maxTokens,
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                };
                
            case "anthropic":
                return {
                    model: config.model,
                    max_tokens: config.maxTokens,
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7
                };
                
            case "ollama":
                return {
                    model: config.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        num_predict: config.maxTokens
                    }
                };
                
            default:
                throw new Error(`Unbekannter Provider: ${provider}`);
        }
    },

    getAIEndpoint: function(provider, config) {
        switch(provider) {
            case "openai":
                return `${config.baseUrl}/chat/completions`;
            case "anthropic": 
                return `${config.baseUrl}/messages`;
            case "ollama":
                return `${config.baseUrl}/generate`;
            default:
                throw new Error(`Unbekannter Provider: ${provider}`);
        }
    },

    getAIHeaders: function(provider, apiKey) {
        switch(provider) {
            case "openai":
                return {
                    'Authorization': `Bearer ${apiKey}`,
                    'OpenAI-Organization': '' // Optional
                };
            case "anthropic":
                return {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
            case "ollama":
                return {}; // Lokaler Service, kein API Key nötig
            default:
                return {};
        }
    },

    extractAIContent: function(response, provider) {
        switch(provider) {
            case "openai":
                return response.choices[0].message.content;
            case "anthropic":
                return response.content[0].text;
            case "ollama":
                return response.response;
            default:
                throw new Error(`Unbekannter Provider: ${provider}`);
        }
    },

    parseAIRecipe: function(aiResponse, context) {
        try {
            // Extrahiere JSON aus der Antwort
            let jsonStr = aiResponse.trim();
            
            // Entferne potentielle Markdown-Formatierung
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/```json\n?/, '').replace(/\n?```$/, '');
            }
            
            const recipe = JSON.parse(jsonStr);
            
            // Validierung und Anreicherung
            this.validateRecipe(recipe);
            this.enrichRecipe(recipe, context);
            
            return recipe;
            
        } catch (error) {
            console.error("Recipe Parse Error:", error);
            throw new Error(`Rezept-Parsing fehlgeschlagen: ${error.message}`);
        }
    },

    validateRecipe: function(recipe) {
        const required = ['title', 'ingredients', 'instructions', 'cookingTime'];
        
        for (const field of required) {
            if (!recipe[field]) {
                throw new Error(`Pflichtfeld fehlt: ${field}`);
            }
        }
        
        if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
            throw new Error("Zutaten müssen ein nicht-leeres Array sein");
        }
        
        if (!Array.isArray(recipe.instructions) || recipe.instructions.length === 0) {
            throw new Error("Anweisungen müssen ein nicht-leeres Array sein");
        }
        
        if (typeof recipe.cookingTime !== 'number' || recipe.cookingTime <= 0) {
            throw new Error("Kochzeit muss eine positive Zahl sein");
        }
    },

    enrichRecipe: function(recipe, context) {
        // Füge Metadaten hinzu
        recipe.id = this.generateRecipeId(recipe.title);
        recipe.generatedAt = new Date().toISOString();
        recipe.context = {
            weather: context.weather,
            season: context.season,
            userProfile: context.userProfile
        };
        
        // Berechne Gesamtzeit wenn nicht angegeben
        if (!recipe.totalTime && recipe.instructions) {
            recipe.totalTime = recipe.instructions.reduce((total, instruction) => {
                return total + (instruction.time || 0);
            }, recipe.cookingTime || 0);
        }
        
        // Standardwerte setzen
        recipe.confidence = recipe.confidence || 75;
        recipe.difficulty = recipe.difficulty || 'medium';
        recipe.seasonal = recipe.seasonal !== false;
        recipe.sustainable = recipe.sustainable !== false;
        
        // Normalisiere Zutateneingaben
        recipe.ingredients = recipe.ingredients.map(ingredient => {
            if (typeof ingredient === 'string') {
                return { text: ingredient, seasonal: false };
            }
            return ingredient;
        });
        
        // Normalisiere Anweisungen
        recipe.instructions = recipe.instructions.map(instruction => {
            if (typeof instruction === 'string') {
                return { text: instruction };
            }
            return instruction;
        });
    },

    generateRecipeId: function(title) {
        return title.toLowerCase()
            .replace(/[äöü]/g, (match) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[match]))
            .replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    },

    cacheRecipe: function(recipe, context) {
        this.recipeCache.push({
            date: context.date,
            recipe: recipe,
            context: context
        });
        
        // Behalte nur die letzten 50 Rezepte
        if (this.recipeCache.length > 50) {
            this.recipeCache = this.recipeCache.slice(-50);
        }
        
        // Speichere Cache auf Festplatte
        this.saveRecipeCache();
    },

    updateUserLearning: function(interaction) {
        console.log("📚 Lerne aus Nutzer-Interaktion:", interaction.type);
        
        // Analysiere Bewertungen
        if (interaction.type === 'rating') {
            this.processRatingFeedback(interaction);
        }
        
        // Lerne aus Rezept-Ansichten
        if (interaction.type === 'recipe_shown') {
            this.processRecipeView(interaction);
        }
        
        // Sende aktualisierte Präferenzen zurück
        this.sendSocketNotification("USER_PROFILE_UPDATED", {
            preferences: this.learnedPreferences
        });
    },

    processRatingFeedback: function(interaction) {
        const { rating, recipe } = interaction.data;
        
        // Positive Bewertungen verstärken ähnliche Rezepte
        if (rating === 'love' || rating === 'like') {
            this.reinforcePreferences(recipe, rating === 'love' ? 2 : 1);
        }
        
        // Negative Bewertungen schwächen ähnliche Rezepte ab
        if (rating === 'dislike') {
            this.reinforcePreferences(recipe, -1);
        }
    },

    reinforcePreferences: function(recipe, strength) {
        // Verstärke/schwäche Tags aus dem bewerteten Rezept
        if (recipe.tags) {
            recipe.tags.forEach(tag => {
                this.learnedPreferences[tag] = (this.learnedPreferences[tag] || 0) + strength;
            });
        }
        
        // Lerne aus Kochzeit-Präferenzen
        const timeCategory = this.categorizeTime(recipe.cookingTime);
        this.learnedPreferences[`time_${timeCategory}`] = 
            (this.learnedPreferences[`time_${timeCategory}`] || 0) + strength;
        
        // Lerne aus Schwierigkeitsgrad
        this.learnedPreferences[`difficulty_${recipe.difficulty}`] = 
            (this.learnedPreferences[`difficulty_${recipe.difficulty}`] || 0) + strength;
    },

    categorizeTime: function(minutes) {
        if (minutes <= 15) return 'quick';
        if (minutes <= 30) return 'medium';
        if (minutes <= 60) return 'long';
        return 'extended';
    },

    getWeatherData: function(location) {
        // Vereinfachte Wetter-API (könnte mit OpenWeatherMap etc. erweitert werden)
        const mockWeather = {
            location: location,
            temperature: 15 + Math.random() * 20, // 15-35°C
            condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
            humidity: 40 + Math.random() * 40,
            timestamp: Date.now()
        };
        
        this.weatherCache = mockWeather;
        this.sendSocketNotification("WEATHER_DATA_RECEIVED", mockWeather);
    },

    getSeasonalIngredients: function(season, region = 'DE') {
        const seasonalData = {
            spring: ['Spargel', 'Rhabarber', 'Spinat', 'Radieschen', 'Feldsalat', 'junge Karotten'],
            summer: ['Tomaten', 'Gurken', 'Zucchini', 'Paprika', 'Auberginen', 'Beeren', 'Steinfrüchte'],
            autumn: ['Kürbis', 'Äpfel', 'Birnen', 'Rosenkohl', 'Wirsing', 'Pilze', 'Nüsse'],
            winter: ['Grünkohl', 'Rosenkohl', 'Lauch', 'Wurzelgemüse', 'Kohl', 'Zitrusfrüchte']
        };
        
        return seasonalData[season] || [];
    },

    generateShoppingList: function(recipe) {
        const shoppingList = {
            recipe: recipe.title,
            date: new Date().toLocaleDateString('de-DE'),
            ingredients: recipe.ingredients.map(ing => ({
                text: ing.text,
                category: this.categorizeIngredient(ing.text),
                seasonal: ing.seasonal || false
            })),
            estimatedCost: recipe.estimatedCost || 'medium'
        };
        
        // Gruppiere nach Kategorien
        const grouped = this.groupIngredientsByCategory(shoppingList.ingredients);
        
        this.sendSocketNotification("SHOPPING_LIST_GENERATED", {
            shoppingList: shoppingList,
            grouped: grouped
        });
    },

    categorizeIngredient: function(ingredient) {
        const categories = {
            'Obst & Gemüse': ['tomate', 'gurke', 'zwiebel', 'knoblauch', 'karotte', 'apfel', 'zitrone'],
            'Fleisch & Fisch': ['fleisch', 'hähnchen', 'rind', 'schwein', 'fisch', 'lachs'],
            'Milchprodukte': ['milch', 'sahne', 'butter', 'käse', 'joghurt', 'quark'],
            'Getreide & Hülsenfrüchte': ['reis', 'pasta', 'brot', 'mehl', 'linsen', 'bohnen'],
            'Gewürze & Kräuter': ['salz', 'pfeffer', 'paprika', 'basilikum', 'petersilie', 'thymian'],
            'Sonstiges': []
        };
        
        const lowerIngredient = ingredient.toLowerCase();
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => lowerIngredient.includes(keyword))) {
                return category;
            }
        }
        
        return 'Sonstiges';
    },

    groupIngredientsByCategory: function(ingredients) {
        const grouped = {};
        
        ingredients.forEach(ingredient => {
            const category = ingredient.category;
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(ingredient);
        });
        
        return grouped;
    },

    loadUserProfile: function() {
        const profilePath = path.join(__dirname, 'user_profile.json');
        
        try {
            if (fs.existsSync(profilePath)) {
                const data = fs.readFileSync(profilePath, 'utf8');
                const profile = JSON.parse(data);
                
                this.userProfile = profile.userProfile || {};
                this.learnedPreferences = profile.learnedPreferences || {};
                
                console.log("✅ Nutzerprofil geladen");
            }
        } catch (error) {
            console.warn("⚠️ Konnte Nutzerprofil nicht laden:", error.message);
        }
    },

    saveUserProfile: function(data) {
        const profilePath = path.join(__dirname, 'user_profile.json');
        
        try {
            const profileData = {
                userProfile: data.userProfile,
                learnedPreferences: data.learnedPreferences,
                lastUpdated: new Date().toISOString(),
                interactionCount: data.interactions?.length || 0
            };
            
            fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
            console.log("✅ Nutzerprofil gespeichert");
            
        } catch (error) {
            console.error("❌ Fehler beim Speichern des Nutzerprofils:", error);
        }
    },

    saveRecipeCache: function() {
        const cachePath = path.join(__dirname, 'recipe_cache.json');
        
        try {
            fs.writeFileSync(cachePath, JSON.stringify(this.recipeCache, null, 2));
        } catch (error) {
            console.error("❌ Fehler beim Speichern des Rezept-Cache:", error);
        }
    },

    generateRecipeImage: async function(title, context) {
        // Placeholder für Bild-Generierung (DALL-E, Stable Diffusion, etc.)
        // Hier könntest du eine Bild-API integrieren
        
        const imagePrompt = `Ein appetitliches Foto von "${title}", professionell fotografiert, 
                           warmes Licht, ansprechend präsentiert, hochwertige Küchenfotografie`;
        
        // Für jetzt returnieren wir einen Placeholder
        return `https://via.placeholder.com/400x300/4CAF50/ffffff?text=${encodeURIComponent(title)}`;
    }
});