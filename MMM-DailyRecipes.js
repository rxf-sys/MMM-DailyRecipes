/* Magic Mirror
 * Module: MMM-DailyRecipes (KI-gesteuert)
 *
 * By Assistant
 * MIT Licensed.
 */

Module.register("MMM-DailyRecipes", {
    defaults: {
        language: "de",
        aiProvider: "openai", // "openai", "anthropic", "local", "ollama"
        apiKey: null, // dein OpenAI/Anthropic API Key
        
        // KI-Präferenzen (werden automatisch gelernt)
        userProfile: {
            dietaryRestrictions: [], // wird automatisch erkannt
            cuisinePreferences: [], // wird automatisch gelernt
            cookingSkillLevel: "medium", // "beginner", "medium", "advanced"
            availableTime: 30, // durchschnittliche verfügbare Kochzeit
            householdSize: 2,
            preferredMealTimes: ["dinner"], // "breakfast", "lunch", "dinner"
            healthGoals: [] // "weight_loss", "muscle_gain", "heart_healthy", etc.
        },
        
        // Automatische Anpassungen
        autoLearnPreferences: true, // lernt aus Interaktionen
        adaptToSeason: true, // berücksichtigt automatisch Saison
        adaptToWeather: true, // berücksichtigt Wetter (warm -> leichte Gerichte)
        adaptToWeekday: true, // Sonntag -> aufwendigere Gerichte
        
        // KI-Verhalten
        creativityLevel: 0.7, // 0.0-1.0 (konservativ bis sehr kreativ)
        includeNutritionFacts: true,
        generateShoppingList: true,
        generateCookingTips: true,
        
        // Technische Einstellungen
        showImage: true,
        showQR: false,
        updateInterval: 24 * 60 * 60 * 1000, // täglich
        cacheRecipes: true,
        maxCachedRecipes: 50,
        
        // Region und Sprache
        region: "DE",
        timezone: "Europe/Berlin",
        
        // Erweiterte KI-Features
        generatePersonalizedMealPlan: false, // 7-Tage Essensplan
        considerLeftovers: true, // berücksichtigt Reste vom Vortag
        budgetConsciousness: "medium", // "low", "medium", "high"
        sustainabilityFocus: true // bevorzugt saisonale, lokale Zutaten
    },

    requiresVersion: "2.1.0",

    currentRecipe: null,
    userInteractions: [],
    learnedPreferences: {},
    weatherData: null,
    recipeCache: [],
    
    start: function() {
        Log.info("Starting AI-powered module: " + this.name);
        this.loaded = false;
        
        // Lade bestehende Nutzerdaten
        this.loadUserProfile();
        
        // Starte KI-Rezeptgenerierung
        this.generateTodaysRecipe();
        
        // Plane regelmäßige Updates
        this.scheduleUpdate();
        
        // Lade Wetterdaten für kontextuelle Empfehlungen
        this.requestWeatherData();
    },

    getStyles: function() {
        return ["MMM-DailyRecipes.css"];
    },

    getScripts: function() {
        return ["moment.js"];
    },

    socketNotificationReceived: function(notification, payload) {
        switch(notification) {
            case "AI_RECIPE_GENERATED":
                this.currentRecipe = payload.recipe;
                this.updateUserInteraction("recipe_shown", payload.recipe);
                this.loaded = true;
                this.updateDom(this.config.animationSpeed);
                break;
                
            case "USER_PROFILE_UPDATED": 
                this.learnedPreferences = payload.preferences;
                this.saveUserProfile();
                break;
                
            case "WEATHER_DATA_RECEIVED":
                this.weatherData = payload;
                // Regeneriere Rezept wenn Wetter stark abweicht
                if (this.shouldRegenerateForWeather(payload)) {
                    this.generateTodaysRecipe();
                }
                break;
                
            case "AI_ERROR":
                Log.error("AI Recipe Generation Error: " + payload.message);
                this.showFallbackRecipe();
                break;
        }
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "daily-recipes-wrapper ai-powered";
        
        // Lade-Screen
        if (!this.loaded) {
            wrapper.innerHTML = `
                <div class="ai-loading">
                    <div class="ai-loader"></div>
                    <span>${this.translate("AI_GENERATING_RECIPE")}</span>
                </div>
            `;
            return wrapper;
        }

        if (!this.currentRecipe) {
            wrapper.innerHTML = this.translate("AI_NO_RECIPE");
            wrapper.className += " dimmed light small";
            return wrapper;
        }

        // KI-Header mit Personalisierungsinfo
        const header = document.createElement("div");
        header.className = "daily-recipes-header ai-header";
        header.innerHTML = `
            <div class="header-main">
                <i class="fas fa-robot"></i>
                <span>${this.translate("AI_RECOMMENDATION")}</span>
                <div class="ai-confidence" title="KI-Sicherheit: ${this.currentRecipe.confidence}%">
                    ${this.getConfidenceStars(this.currentRecipe.confidence)}
                </div>
            </div>
            <div class="personalization-info">
                ${this.getPersonalizationReason()}
            </div>
        `;
        wrapper.appendChild(header);

        // Recipe Container mit KI-spezifischen Elementen
        const recipeContainer = document.createElement("div");
        recipeContainer.className = "recipe-container ai-generated";

        // Dynamisch generiertes Bild (falls verfügbar)
        if (this.config.showImage && this.currentRecipe.imageUrl) {
            const imageDiv = document.createElement("div");
            imageDiv.className = "recipe-image ai-image";
            imageDiv.style.backgroundImage = `url(${this.currentRecipe.imageUrl})`;
            
            // KI-Badge
            const aiBadge = document.createElement("div");
            aiBadge.className = "ai-badge";
            aiBadge.innerHTML = '<i class="fas fa-magic"></i>';
            imageDiv.appendChild(aiBadge);
            
            recipeContainer.appendChild(imageDiv);
        }

        // Recipe Info mit KI-Empfehlungsgrund
        const infoDiv = document.createElement("div");
        infoDiv.className = "recipe-info";

        // Title mit KI-Kreativitätsanzeige
        const title = document.createElement("div");
        title.className = "recipe-title ai-title";
        title.innerHTML = `
            ${this.currentRecipe.title}
            ${this.currentRecipe.isCreative ? '<span class="creative-badge">✨</span>' : ''}
        `;
        infoDiv.appendChild(title);

        // KI-Empfehlungsgrund
        if (this.currentRecipe.recommendationReason) {
            const reasonDiv = document.createElement("div");
            reasonDiv.className = "ai-recommendation-reason";
            reasonDiv.innerHTML = `<i class="fas fa-lightbulb"></i> ${this.currentRecipe.recommendationReason}`;
            infoDiv.appendChild(reasonDiv);
        }

        // Enhanced Meta Info
        const metaDiv = document.createElement("div");
        metaDiv.className = "recipe-meta ai-meta";
        
        // Kochzeit mit KI-Anpassung
        if (this.currentRecipe.cookingTime) {
            const timeSpan = document.createElement("span");
            timeSpan.className = "meta-item time-adapted";
            timeSpan.innerHTML = `<i class="far fa-clock"></i> ${this.currentRecipe.cookingTime} Min.`;
            if (this.currentRecipe.timeAdapted) {
                timeSpan.title = "An deine verfügbare Zeit angepasst";
            }
            metaDiv.appendChild(timeSpan);
        }

        // Portionen
        const servingsSpan = document.createElement("span");
        servingsSpan.className = "meta-item";
        servingsSpan.innerHTML = `<i class="fas fa-users"></i> ${this.config.userProfile.householdSize} Portionen`;
        metaDiv.appendChild(servingsSpan);

        // Schwierigkeitsgrad
        if (this.currentRecipe.difficulty) {
            const difficultySpan = document.createElement("span");
            difficultySpan.className = "meta-item difficulty";
            difficultySpan.innerHTML = `<i class="fas fa-chart-bar"></i> ${this.translate(this.currentRecipe.difficulty.toUpperCase())}`;
            metaDiv.appendChild(difficultySpan);
        }

        // Saisonal/Nachhaltig
        if (this.currentRecipe.seasonal || this.currentRecipe.sustainable) {
            const sustainableSpan = document.createElement("span");
            sustainableSpan.className = "meta-item sustainable";
            sustainableSpan.innerHTML = `<i class="fas fa-leaf"></i> ${this.translate("SUSTAINABLE")}`;
            metaDiv.appendChild(sustainableSpan);
        }

        infoDiv.appendChild(metaDiv);

        // KI-generierte Zutatenliste mit intelligenter Skalierung
        if (this.currentRecipe.ingredients && this.currentRecipe.ingredients.length > 0) {
            const ingredientsDiv = document.createElement("div");
            ingredientsDiv.className = "recipe-ingredients ai-ingredients";
            
            const ingredientsHeader = document.createElement("div");
            ingredientsHeader.className = "section-header";
            ingredientsHeader.innerHTML = `
                <h4>${this.translate("INGREDIENTS")}</h4>
                <div class="ai-tools">
                    <button class="shopping-list-btn" onclick="generateShoppingList()">
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                </div>
            `;
            ingredientsDiv.appendChild(ingredientsHeader);

            const ingredientsList = document.createElement("ul");
            this.currentRecipe.ingredients.forEach(ingredient => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span class="ingredient-text">${ingredient.text}</span>
                    ${ingredient.seasonal ? '<span class="seasonal-tag">🌱</span>' : ''}
                    ${ingredient.alternative ? `<span class="alternative" title="${ingredient.alternative}">💡</span>` : ''}
                `;
                ingredientsList.appendChild(li);
            });
            ingredientsDiv.appendChild(ingredientsList);
            infoDiv.appendChild(ingredientsDiv);
        }

        // KI-optimierte Anleitung
        if (this.currentRecipe.instructions && this.currentRecipe.instructions.length > 0) {
            const instructionsDiv = document.createElement("div");
            instructionsDiv.className = "recipe-instructions ai-instructions";
            
            const instructionsHeader = document.createElement("div");
            instructionsHeader.className = "section-header";
            instructionsHeader.innerHTML = `
                <h4>${this.translate("INSTRUCTIONS")}</h4>
                <div class="ai-tools">
                    <div class="estimated-time">${this.currentRecipe.totalTime || this.currentRecipe.cookingTime} Min.</div>
                </div>
            `;
            instructionsDiv.appendChild(instructionsHeader);

            const instructionsList = document.createElement("ol");
            this.currentRecipe.instructions.slice(0, 4).forEach((instruction, index) => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="instruction-text">${instruction.text}</div>
                    ${instruction.time ? `<div class="instruction-time">${instruction.time} Min.</div>` : ''}
                    ${instruction.tip ? `<div class="ai-tip"><i class="fas fa-lightbulb"></i> ${instruction.tip}</div>` : ''}
                `;
                instructionsList.appendChild(li);
            });
            
            if (this.currentRecipe.instructions.length > 4) {
                const moreSteps = document.createElement("li");
                moreSteps.className = "more-steps";
                moreSteps.innerHTML = `
                    <div class="show-more" onclick="showFullRecipe()">
                        <i class="fas fa-chevron-down"></i>
                        ${this.translate("SHOW_MORE_STEPS", {count: this.currentRecipe.instructions.length - 4})}
                    </div>
                `;
                instructionsList.appendChild(moreSteps);
            }
            
            instructionsDiv.appendChild(instructionsList);
            infoDiv.appendChild(instructionsDiv);
        }

        // KI-generierte Nährwerte (falls aktiviert)
        if (this.config.includeNutritionFacts && this.currentRecipe.nutrition) {
            const nutritionDiv = document.createElement("div");
            nutritionDiv.className = "recipe-nutrition ai-nutrition";
            nutritionDiv.innerHTML = `
                <h4>${this.translate("NUTRITION_FACTS")}</h4>
                <div class="nutrition-grid">
                    <div class="nutrition-item">
                        <span class="value">${this.currentRecipe.nutrition.calories}</span>
                        <span class="label">kcal</span>
                    </div>
                    <div class="nutrition-item">
                        <span class="value">${this.currentRecipe.nutrition.protein}g</span>
                        <span class="label">Protein</span>
                    </div>
                    <div class="nutrition-item">
                        <span class="value">${this.currentRecipe.nutrition.carbs}g</span>
                        <span class="label">Kohlenhydr.</span>
                    </div>
                    <div class="nutrition-item">
                        <span class="value">${this.currentRecipe.nutrition.fat}g</span>
                        <span class="label">Fett</span>
                    </div>
                </div>
            `;
            infoDiv.appendChild(nutritionDiv);
        }

        // Interaktive Bewertung (für KI-Lernen)
        const ratingDiv = document.createElement("div");
        ratingDiv.className = "ai-rating";
        ratingDiv.innerHTML = `
            <div class="rating-prompt">${this.translate("RATE_RECIPE")}</div>
            <div class="rating-buttons">
                <button class="rating-btn" onclick="rateRecipe('love')" title="❤️ Liebe es!">
                    <i class="fas fa-heart"></i>
                </button>
                <button class="rating-btn" onclick="rateRecipe('like')" title="👍 Gefällt mir">
                    <i class="fas fa-thumbs-up"></i>
                </button>
                <button class="rating-btn" onclick="rateRecipe('dislike')" title="👎 Gefällt mir nicht">
                    <i class="fas fa-thumbs-down"></i>
                </button>
                <button class="rating-btn" onclick="rateRecipe('skip')" title="⏭️ Überspringen">
                    <i class="fas fa-forward"></i>
                </button>
            </div>
        `;
        infoDiv.appendChild(ratingDiv);

        recipeContainer.appendChild(infoDiv);
        wrapper.appendChild(recipeContainer);

        return wrapper;
    },

    generateTodaysRecipe: function() {
        const context = this.buildAIContext();
        this.sendSocketNotification("GENERATE_AI_RECIPE", context);
    },

    buildAIContext: function() {
        const now = moment();
        
        return {
            // Zeitkontext
            date: now.format('YYYY-MM-DD'),
            dayOfWeek: now.format('dddd'),
            season: this.getCurrentSeason(),
            timeOfDay: now.format('HH:mm'),
            
            // Wetter-Kontext
            weather: this.weatherData,
            
            // Nutzer-Kontext
            userProfile: this.config.userProfile,
            learnedPreferences: this.learnedPreferences,
            recentInteractions: this.userInteractions.slice(-10),
            
            // Einstellungen
            creativityLevel: this.config.creativityLevel,
            region: this.config.region,
            language: this.config.language,
            
            // Constraints
            maxCookingTime: this.config.userProfile.availableTime,
            householdSize: this.config.userProfile.householdSize,
            budgetLevel: this.config.budgetConsciousness,
            
            // Features
            generateNutrition: this.config.includeNutritionFacts,
            generateTips: this.config.generateCookingTips,
            considerSustainability: this.config.sustainabilityFocus
        };
    },

    updateUserInteraction: function(type, data) {
        const interaction = {
            timestamp: Date.now(),
            type: type,
            data: data
        };
        
        this.userInteractions.push(interaction);
        
        // Behalte nur die letzten 100 Interaktionen
        if (this.userInteractions.length > 100) {
            this.userInteractions = this.userInteractions.slice(-100);
        }
        
        // Sende an KI für Lernen
        if (this.config.autoLearnPreferences) {
            this.sendSocketNotification("UPDATE_USER_LEARNING", interaction);
        }
    },

    getPersonalizationReason: function() {
        if (!this.currentRecipe.personalizationFactors) return "";
        
        const factors = this.currentRecipe.personalizationFactors;
        const reasons = [];
        
        if (factors.weather) reasons.push(`🌤️ ${factors.weather}`);
        if (factors.time) reasons.push(`⏰ ${factors.time}`);
        if (factors.season) reasons.push(`🌱 ${factors.season}`);
        if (factors.preference) reasons.push(`❤️ ${factors.preference}`);
        
        return reasons.join(" • ");
    },

    getConfidenceStars: function(confidence) {
        const stars = Math.round(confidence / 20);
        return "★".repeat(stars) + "☆".repeat(5 - stars);
    },

    getCurrentSeason: function() {
        const month = moment().month() + 1;
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'autumn';
        return 'winter';
    },

    shouldRegenerateForWeather: function(weather) {
        // Regeneriere bei extremen Wetteränderungen
        if (!this.currentRecipe || !this.currentRecipe.weatherContext) return false;
        
        const tempDiff = Math.abs(weather.temperature - this.currentRecipe.weatherContext.temperature);
        return tempDiff > 10; // 10°C Unterschied
    },

    requestWeatherData: function() {
        this.sendSocketNotification("REQUEST_WEATHER_DATA", {
            location: this.config.region
        });
    },

    loadUserProfile: function() {
        // Lade gespeicherte Nutzerdaten
        this.sendSocketNotification("LOAD_USER_PROFILE", {});
    },

    saveUserProfile: function() {
        // Speichere aktuellen Zustand
        this.sendSocketNotification("SAVE_USER_PROFILE", {
            userProfile: this.config.userProfile,
            learnedPreferences: this.learnedPreferences,
            interactions: this.userInteractions
        });
    },

    scheduleUpdate: function() {
        const self = this;
        
        // Tägliches Update um eine zufällige Zeit zwischen 6-9 Uhr
        const updateHour = 6 + Math.floor(Math.random() * 3);
        const updateMinute = Math.floor(Math.random() * 60);
        
        const now = moment();
        const nextUpdate = moment().hour(updateHour).minute(updateMinute).second(0);
        
        if (nextUpdate.isBefore(now)) {
            nextUpdate.add(1, 'day');
        }
        
        const msUntilUpdate = nextUpdate.diff(now);
        
        setTimeout(() => {
            self.generateTodaysRecipe();
            self.scheduleUpdate(); // Plane nächstes Update
        }, msUntilUpdate);
    },

    showFallbackRecipe: function() {
        // Zeige einfaches Fallback-Rezept wenn KI nicht verfügbar
        this.currentRecipe = {
            title: "Einfache Pasta mit Tomatensoße",
            cookingTime: 20,
            confidence: 50,
            recommendationReason: "Fallback-Rezept (KI nicht verfügbar)",
            ingredients: [
                {text: "300g Pasta"},
                {text: "400g Tomatenpüree"},
                {text: "2 Knoblauchzehen"},
                {text: "Olivenöl, Salz, Pfeffer"}
            ],
            instructions: [
                {text: "Pasta in Salzwasser kochen"},
                {text: "Knoblauch in Olivenöl anbraten"},
                {text: "Tomatenpüree zugeben, würzen"},
                {text: "Mit Pasta vermischen"}
            ],
            difficulty: "easy",
            seasonal: false
        };
        
        this.loaded = true;
        this.updateDom(this.config.animationSpeed);
    },

    getTranslations: function() {
        return {
            en: "translations/en.json",
            de: "translations/de.json"
        };
    }
});

// Globale Funktionen für Interaktionen
function rateRecipe(rating) {
    const module = MM.getModules().withClass("MMM-DailyRecipes")[0];
    if (module) {
        module.updateUserInteraction("rating", {
            rating: rating,
            recipe: module.currentRecipe.title
        });
        
        // Visuelles Feedback
        document.querySelector(`.rating-btn[onclick="rateRecipe('${rating}')"]`).classList.add('selected');
        
        // Nach 2 Sekunden neues Rezept generieren falls gewünscht
        if (rating === 'skip') {
            setTimeout(() => {
                module.generateTodaysRecipe();
            }, 2000);
        }
    }
}

function generateShoppingList() {
    const module = MM.getModules().withClass("MMM-DailyRecipes")[0];
    if (module) {
        module.sendSocketNotification("GENERATE_SHOPPING_LIST", {
            recipe: module.currentRecipe
        });
    }
}

function showFullRecipe() {
    const module = MM.getModules().withClass("MMM-DailyRecipes")[0];
    if (module) {
        module.sendSocketNotification("SHOW_FULL_RECIPE", {
            recipe: module.currentRecipe
        });
    }
}