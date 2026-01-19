import menu_mod from "./menu_mod.js";
import home from "./home.js";
import { CanvasRenderer } from "../skama_code/ui/canvas_render.js";
import { SystemBuilder } from "../skama_code/api/system.js"
import { Position } from "../skama_code/commun/position.js";
import { Ship } from "../skama_code/api/ship.js";
// Import des nouveaux services
import { spaceTradersClient, statisticsTracker, fleetManager } from "../skama_code/services/index.js";

// Fonction globale pour nettoyer le panneau depuis d'autres pages
window.cleanupSystemStatusPanel = function() {
    $("#status-panel").remove();
};

function showPlanetInfo(planet) {
    let traitsText = planet.traits ? planet.traits.map(t => t.name || t.symbol).join(", ") : "None";
    let factionText = planet.faction ? planet.faction.symbol : "None";
    
    // Récupérer les vaisseaux disponibles
    Ship.list((ships) => {
        let shipsAtLocation = ships.filter(s => s.nav.waypointSymbol === planet.name);
        let otherShips = ships.filter(s => s.nav.waypointSymbol !== planet.name && s.nav.systemSymbol === planet.system);
        
        let shipsHTML = "";
        if (shipsAtLocation.length > 0) {
            shipsHTML += `<p><strong>Ships at this location:</strong></p><ul style="margin: 5px 0;">`;
            shipsAtLocation.forEach(ship => {
                shipsHTML += `<li style="color: #00ff00;">${ship.symbol} (${ship.nav.status})</li>`;
            });
            shipsHTML += `</ul>`;
        }
        
        if (otherShips.length > 0) {
            shipsHTML += `<p><strong>Navigate ships here:</strong></p>`;
            otherShips.forEach(ship => {
                shipsHTML += `<button class="navigate-ship-btn" data-ship="${ship.symbol}" data-destination="${planet.name}" 
                    style="margin: 5px; padding: 8px 15px; background: #0080ff; color: white; border: none; 
                    border-radius: 5px; cursor: pointer; font-size: 12px;">
                    ${ship.symbol} from ${ship.nav.waypointSymbol}
                </button>`;
            });
        }
        
        let infoHTML = `
            <div class="planet-info-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                        background: rgba(0, 0, 0, 0.95); color: white; padding: 30px; 
                        border-radius: 10px; border: 2px solid #00ffff; z-index: 10000; 
                        min-width: 400px; max-width: 600px; box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);">
                <h2 style="margin-top: 0; color: #00ffff; border-bottom: 2px solid #00ffff; padding-bottom: 10px;">${planet.name}</h2>
                <p><strong>Type:</strong> ${planet.type}</p>
                <p><strong>System:</strong> ${planet.system}</p>
                <p><strong>Position:</strong> X: ${planet.position.x}, Y: ${planet.position.y}</p>
                <p><strong>Faction:</strong> ${factionText}</p>
                <p><strong>Traits:</strong> ${traitsText}</p>
                ${planet.orbits ? `<p><strong>Orbits:</strong> ${planet.orbits}</p>` : ""}
                ${planet.moons && planet.moons.length > 0 ? `<p><strong>Moons:</strong> ${planet.moons.length}</p>` : ""}
                ${planet.is_under_construction ? `<p><strong>Status:</strong> <span style="color: orange;">Under Construction</span></p>` : ""}
                ${shipsHTML}
                <button id="close-planet-info" style="margin-top: 20px; padding: 10px 20px; 
                        background: #00ffff; color: black; border: none; border-radius: 5px; 
                        cursor: pointer; font-weight: bold;">Close</button>
            </div>
            <div id="planet-info-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                        background: rgba(0, 0, 0, 0.7); z-index: 9999;"></div>
        `;
        
        // Supprimer les anciennes modales si elles existent
        $(".planet-info-modal").remove();
        $("#planet-info-overlay").remove();
        
        $('body').append(infoHTML);
        
        // Fonction pour fermer la modal
        function closePlanetModal() {
            console.log("Closing planet modal");
            $(".planet-info-modal").remove();
            $("#planet-info-overlay").remove();
            $(document).off("keydown.planetModal");
        }
        
        // Fermeture avec le bouton - attacher immédiatement
        $("#close-planet-info").on("click", function(e) {
            console.log("Close button clicked");
            e.preventDefault();
            e.stopPropagation();
            closePlanetModal();
            return false;
        });
        
        // Fermeture avec l'overlay
        $("#planet-info-overlay").on("click", function(e) {
            console.log("Overlay clicked");
            e.preventDefault();
            e.stopPropagation();
            closePlanetModal();
            return false;
        });
        
        // Fermeture avec la touche Esc
        $(document).off("keydown.planetModal").on("keydown.planetModal", function(e) {
            if (e.key === "Escape" || e.keyCode === 27) {
                console.log("Escape pressed");
                closePlanetModal();
            }
        });
        
        $(".navigate-ship-btn").on("click", function(e) {
            e.stopPropagation();
            let shipSymbol = $(this).attr("data-ship");
            let destination = $(this).attr("data-destination");
            navigateShip(shipSymbol, destination);
        });
    }, (err) => {
        console.error("Could not load ships", err);
    });
}

function navigateShip(shipSymbol, destination) {
    // Utilise le nouveau client API avec rate limiting et retry automatiques
    (async () => {
        try {
            // D'abord, mettre le vaisseau en orbite
            try {
                await spaceTradersClient.orbitShip(shipSymbol);
            } catch (orbitError) {
                // Si déjà en orbite (code 4214), continuer
                if (orbitError.code !== 4214) {
                    throw orbitError;
                }
            }

            // Naviguer vers la destination
            const response = await spaceTradersClient.navigateShip(shipSymbol, destination);
            const nav = response.data.nav;
            
            alert(`Ship ${shipSymbol} is now traveling to ${destination}!\nArrival: ${new Date(nav.route.arrival).toLocaleString()}`);
            $("#close-planet-info").click();
            updateStatusPanel();
            
            // Synchroniser la flotte
            fleetManager.syncFleet().catch(console.error);
            
        } catch (error) {
            const errorMsg = error.message || "Navigation failed";
            alert(`Failed to navigate: ${errorMsg}`);
        }
    })();
}

let globalPlanets = [];
let globalCanvas = null;

function setupPlanetSearch(planets, canvas) {
    globalPlanets = planets;
    globalCanvas = canvas;
    
    $("#planet-search").off("input").on("input", function() {
        let searchTerm = $(this).val().toLowerCase();
        if (searchTerm.length === 0) {
            $("#search-results").html("");
            return;
        }
        
        let filteredPlanets = planets.filter(p => 
            p.name.toLowerCase().includes(searchTerm) || 
            p.type.toLowerCase().includes(searchTerm)
        );
        
        displaySearchResults(filteredPlanets);
    });
}

function displaySearchResults(planets) {
    if (planets.length === 0) {
        $("#search-results").html('<p style="color: #aaa; font-size: 11px; padding: 5px;">No planets found</p>');
        return;
    }
    
    let resultsHTML = '';
    planets.slice(0, 10).forEach(planet => {
        resultsHTML += `
            <div class="planet-result" data-planet="${planet.name}" 
                style="margin: 5px 0; padding: 8px; background: rgba(0, 255, 255, 0.1); 
                border-radius: 5px; cursor: pointer; border: 1px solid transparent;
                transition: all 0.2s;">
                <div style="font-weight: bold; font-size: 12px; color: #00ffff;">${planet.name}</div>
                <div style="font-size: 10px; color: #aaa;">${planet.type}</div>
                <div style="margin-top: 5px; font-size: 11px;">
                    <button class="zoom-planet-btn" data-planet="${planet.name}" 
                        style="padding: 4px 8px; background: #0080ff; color: white; border: none; 
                        border-radius: 3px; cursor: pointer; margin-right: 5px; font-size: 10px;">
                        🔍 Zoom
                    </button>
                    <button class="nav-to-planet-btn" data-planet="${planet.name}" 
                        style="padding: 4px 8px; background: #00aa00; color: white; border: none; 
                        border-radius: 3px; cursor: pointer; font-size: 10px;">
                        🚀 Navigate
                    </button>
                </div>
            </div>
        `;
    });
    
    if (planets.length > 10) {
        resultsHTML += `<p style="color: #aaa; font-size: 10px; padding: 5px;">+${planets.length - 10} more results...</p>`;
    }
    
    $("#search-results").html(resultsHTML);
    
    // Hover effect
    $(".planet-result").hover(
        function() { $(this).css({"background": "rgba(0, 255, 255, 0.2)", "border-color": "#00ffff"}); },
        function() { $(this).css({"background": "rgba(0, 255, 255, 0.1)", "border-color": "transparent"}); }
    );
    
    // Zoom button
    $(".zoom-planet-btn").off("click").on("click", function(e) {
        e.stopPropagation();
        let planetName = $(this).attr("data-planet");
        zoomToPlanet(planetName);
    });
    
    // Navigate button
    $(".nav-to-planet-btn").off("click").on("click", function(e) {
        e.stopPropagation();
        let planetName = $(this).attr("data-planet");
        showNavigationOptions(planetName);
    });
    
    // Click sur le résultat pour zoomer
    $(".planet-result").off("click").on("click", function() {
        let planetName = $(this).attr("data-planet");
        zoomToPlanet(planetName);
    });
}

function zoomToPlanet(planetName) {
    let planet = globalPlanets.find(p => p.name === planetName);
    if (!planet || !globalCanvas) return;
    
    // Centrer le canvas sur la planète
    let planetPos = globalCanvas.canvas_pos(planet.position);
    let centerX = globalCanvas.canvas.width / 2;
    let centerY = globalCanvas.canvas.height / 2;
    
    // Calculer le déplacement nécessaire
    let offsetX = centerX - planetPos.x;
    let offsetY = centerY - planetPos.y;
    
    // Déplacer tous les objets
    globalCanvas.canvas.getObjects().forEach(obj => {
        obj.left += offsetX;
        obj.top += offsetY;
        obj.setCoords();
    });
    
    globalCanvas.canvas.renderAll();
    
    // Effet visuel
    setTimeout(() => {
        showPlanetInfo(planet);
    }, 300);
}

function showNavigationOptions(planetName) {
    let planet = globalPlanets.find(p => p.name === planetName);
    if (!planet) return;
    
    Ship.list((ships) => {
        let otherShips = ships.filter(s => s.nav.waypointSymbol !== planetName && s.nav.systemSymbol === planet.system);
        
        if (otherShips.length === 0) {
            alert("No ships available in this system to navigate to " + planetName);
            return;
        }
        
        let shipsHTML = `<h4 style="color: #00ffff; margin-bottom: 10px;">Select a ship to navigate to ${planetName}:</h4>`;
        otherShips.forEach(ship => {
            shipsHTML += `
                <button class="quick-nav-ship" data-ship="${ship.symbol}" data-dest="${planetName}" 
                    style="display: block; width: 100%; margin: 5px 0; padding: 10px; 
                    background: #0080ff; color: white; border: none; border-radius: 5px; 
                    cursor: pointer; text-align: left; font-size: 12px;">
                    🚀 ${ship.symbol} (from ${ship.nav.waypointSymbol})
                </button>
            `;
        });
        
        let modalHTML = `
            <div id="nav-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                background: rgba(0, 0, 0, 0.95); color: white; padding: 20px; border-radius: 10px; 
                border: 2px solid #00ffff; z-index: 10000; min-width: 300px;">
                ${shipsHTML}
                <button id="close-nav-modal" style="margin-top: 15px; padding: 10px; 
                    background: #ff4444; color: white; border: none; border-radius: 5px; 
                    cursor: pointer; width: 100%;">Cancel</button>
            </div>
            <div id="nav-modal-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
                background: rgba(0, 0, 0, 0.7); z-index: 9999;"></div>
        `;
        
        $("body").append(modalHTML);
        
        $("#close-nav-modal, #nav-modal-overlay").on("click", function() {
            $("#nav-modal").remove();
            $("#nav-modal-overlay").remove();
        });
        
        $(".quick-nav-ship").on("click", function() {
            let shipSymbol = $(this).attr("data-ship");
            let destination = $(this).attr("data-dest");
            $("#nav-modal").remove();
            $("#nav-modal-overlay").remove();
            navigateShip(shipSymbol, destination);
        });
    }, (err) => {
        alert("Failed to load ships");
    });
}


function get_img_from_type(planet)
{
    switch(planet.type)
    {
        case "PLANET":
            return ["PLANET.png"];
        case "GAS_GIANT": 
            return ["GAS_GIANT.png"];
        case "MOON":
            return ["MOON.png"];
        case "ORBITAL_STATION":
            return ["ORBITAL_STATION.png"];
        case "JUMP_GATE":
            return ["jumpgate.png"];
        case "ASTEROID_FIELD":
            return ["ASTEROID_FIELD.png"];
        case "ASTEROID":
            return ["asteroid1.png", "asteroid2.png", "asteroid3.png", "asteroid4.png"];
        case "ENGINEERED_ASTEROID":
            return ["ENGINEERED_ASTEROID.png"];
        case "ASTEROID_BASE":
            return ["ASTEROID_BASE.png"];
        case "NEBULA":
            return [];
        case "DEBRIS_FIELD":
            return [];
        case "GRAVITY_WELL":
            return ["GRAVITY_WELL.png"];
        case "ARTIFICIAL_GRAVITY_WELL":
            return ["ARTIFICAL_GRAVITY_WELL.png"];
        case "FUEL_STATION":
            return ["FUEL_STATION.png"];
        case _:
            return [];
    }
}

function get_scale_from_type(planet)
{
    switch(planet.type)
    {
        case "PLANET":
            return 0.04;
        case "GAS_GIANT": 
            return 0.04;
        case "MOON":
            return 0.04;
        case "ORBITAL_STATION":
            return 0.06;
        case "JUMP_GATE":
            return 0.08;
        case "ASTEROID_FIELD":
            return 0.05;
        case "ASTEROID":
            return 0.08;
        case "ENGINEERED_ASTEROID":
            return 0.03;
        case "ASTEROID_BASE":
            return 0.03;
        case "GRAVITY_WELL":
            return 0.08;
        case "ARTIFICIAL_GRAVITY_WELL":
            return 0.07;
        case "FUEL_STATION":
            return 0.04;
        default:
            return 0.05;
    }
}

export default function system(temp_engine, sys_name, tryShipSystem = false) {
    // Variables locales au système uniquement
    let statusUpdateInterval = null;
    
    // Fonctions locales pour gérer le panneau de status
    function createStatusPanel() {
        let panelHTML = `
            <div id="status-panel" data-system-panel="true" style="position: fixed; top: 80px; left: 20px; 
                background: rgba(0, 0, 0, 0.9); color: white; padding: 15px; 
                border-radius: 10px; border: 2px solid #00ffff; z-index: 9000; 
                min-width: 300px; max-width: 350px; max-height: 80vh; overflow-y: auto;
                box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);">
                <h3 style="margin-top: 0; color: #00ffff; border-bottom: 2px solid #00ffff; padding-bottom: 10px; font-size: 18px;">
                    ⚡ STATUS PANEL
                </h3>
                <div style="margin-bottom: 15px;">
                    <input type="text" id="planet-search" placeholder="🔍 Search planets..." 
                        style="width: 100%; padding: 10px; background: rgba(0, 255, 255, 0.1); 
                        border: 1px solid #00ffff; border-radius: 5px; color: white; 
                        font-size: 13px; box-sizing: border-box;" />
                    <div id="search-results" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
                </div>
                <div id="status-content" style="font-size: 13px;">
                    <p style="color: #aaa;">Loading...</p>
                </div>
            </div>
        `;
        
        if ($("#status-panel").length === 0) {
            $("body").append(panelHTML);
            updateStatusPanel();
            // Créer un nouveau intervalle
            statusUpdateInterval = setInterval(updateStatusPanel, 10000);
        }
    }

    function updateStatusPanel() {
        // Vérifier si le panneau existe toujours, sinon arrêter l'intervalle
        if ($("#status-panel").length === 0) {
            console.log("Status panel not found, stopping interval");
            if (statusUpdateInterval) {
                clearInterval(statusUpdateInterval);
                statusUpdateInterval = null;
            }
            return;
        }
        
        // Récupérer les vaisseaux
        Ship.list((ships) => {
            let shipsHTML = '<div style="margin-bottom: 15px;"><h4 style="color: #00ffff; margin: 5px 0; font-size: 14px;">🚀 SHIPS (' + ships.length + ')</h4>';
            
            ships.forEach(ship => {
                let statusColor = ship.nav.status === "IN_TRANSIT" ? "#ffaa00" : 
                                 ship.nav.status === "DOCKED" ? "#00ff00" : "#00aaff";
                let statusIcon = ship.nav.status === "IN_TRANSIT" ? "➡️" : 
                                ship.nav.status === "DOCKED" ? "🛥" : "🛸";
                
                let arrivalInfo = "";
                if (ship.nav.status === "IN_TRANSIT" && ship.nav.route) {
                    let arrival = new Date(ship.nav.route.arrival);
                    let now = new Date();
                    let remaining = Math.max(0, Math.ceil((arrival - now) / 1000 / 60));
                    arrivalInfo = `<br><span style="color: #ffaa00; font-size: 11px;">⏱ ${remaining}min to ${ship.nav.route.destination.symbol}</span>`;
                }
                
                shipsHTML += `
                    <div style="margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 5px; border-left: 3px solid ${statusColor};">
                        <div style="font-weight: bold; font-size: 12px;">${statusIcon} ${ship.symbol}</div>
                        <div style="font-size: 11px; color: #aaa;">📍 ${ship.nav.waypointSymbol}</div>
                        <div style="font-size: 11px; color: ${statusColor};">Status: ${ship.nav.status}</div>
                        ${arrivalInfo}
                    </div>
                `;
            });
            shipsHTML += '</div>';
            
            // Récupérer les contrats avec le nouveau client API
            spaceTradersClient.getContracts().then((response) => {
                let contractsHTML = '<div><h4 style="color: #00ffff; margin: 5px 0; font-size: 14px;">📜 CONTRACTS (' + response.data.length + ')</h4>';
                
                response.data.forEach(contract => {
                    let statusColor = contract.fulfilled ? "#00ff00" : 
                                     contract.accepted ? "#ffaa00" : "#aaa";
                    let statusText = contract.fulfilled ? "COMPLETED" : 
                                    contract.accepted ? "IN PROGRESS" : "AVAILABLE";
                    let statusIcon = contract.fulfilled ? "✅" : 
                                    contract.accepted ? "⏳" : "📝";
                    
                    contractsHTML += `
                        <div style="margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 5px; border-left: 3px solid ${statusColor};">
                            <div style="font-weight: bold; font-size: 12px;">${statusIcon} ${contract.factionSymbol}</div>
                            <div style="font-size: 11px; color: ${statusColor};">${statusText}</div>
                            <div style="font-size: 11px; color: #aaa;">${contract.type}</div>
                        </div>
                    `;
                });
                contractsHTML += '</div>';
                
                // Ajouter les statistiques de session
                const sessionStats = statisticsTracker.getSessionStats();
                let statsHTML = `
                    <div style="margin-top: 15px; border-top: 1px solid #00ffff; padding-top: 10px;">
                        <h4 style="color: #00ffff; margin: 5px 0; font-size: 14px;">📊 SESSION STATS</h4>
                        <div style="font-size: 11px; color: #aaa;">
                            <div>⏱️ Duration: ${sessionStats.duration}</div>
                            <div>💰 Profit: <span style="color: ${sessionStats.profit >= 0 ? '#00ff00' : '#ff4444'};">${sessionStats.profit.toLocaleString()} credits</span></div>
                            <div>📈 Per Hour: ${sessionStats.profitPerHour.toLocaleString()} credits/h</div>
                        </div>
                    </div>
                `;
                
                $("#status-content").html(shipsHTML + contractsHTML + statsHTML);
            }).catch((err) => {
                $("#status-content").html(shipsHTML + '<p style="color: #ff6666; font-size: 11px;">Failed to load contracts</p>');
            });
        }, (err) => {
            $("#status-content").html('<p style="color: #ff6666;">Failed to load status</p>');
        });
    }
    
    // Nettoyer le panneau existant
    $("#status-panel").remove();
    
    // Vérifie d'abord si le système existe avant de rendre le template
    SystemBuilder.get(sys_name, (system) => {
        // Le système existe, on peut rendre le template
        temp_engine.after_render(() => {
            $("body").css("background-image", "url('/assets/planets/backgroundcanvas.png')");
            let canvas = new CanvasRenderer("sys-canvas", 1200, 700);
            canvas.resize(window.innerWidth, window.innerHeight);
            
            system.list_all_planets((planets) => {
                canvas.clean();
                planets.forEach((planet) => {
                        let urls = get_img_from_type(planet);
                        if(urls.length)
                        {
                            let url = urls[Math.floor(Math.random() * urls.length)];
                            let scale = get_scale_from_type(planet);
                            canvas.obj_from_img("assets/planets/" + url, canvas.canvas_pos(planet.position), {
                                selectable: false,
                                name: planet.name,
                                update: null,
                                scale: scale,
                                planetData: planet
                            });
                        }
                    });
                
                // Attendre que toutes les images soient chargées avant de zoomer et centrer
                setTimeout(() => {
                    // Définir le zoom initial
                    canvas.canvas.setZoom(0.5);
                    
                    // Centrer la vue sur le centre du système (0, 0)
                    let vpt = canvas.canvas.viewportTransform;
                    vpt[4] = canvas.canvas.width / 2;
                    vpt[5] = canvas.canvas.height / 2;
                    
                    canvas.canvas.renderAll();
                }, 200);
                
                let zoom = 0;
                let isPanning = false;
                let lastPosX = 0;
                let lastPosY = 0;
                
                // Activer le panning avec la souris
                canvas.canvas.on('mouse:down', function(opt) {
                    let evt = opt.e;
                    // Vérifier si on clique sur une planète
                    if (opt.target && opt.target.planetData) {
                        showPlanetInfo(opt.target.planetData);
                        return;
                    }
                    // Sinon activer le panning (bouton du milieu, Ctrl+clic, ou clic gauche sur fond)
                    if (evt.button === 1 || evt.ctrlKey || evt.button === 0) {
                        isPanning = true;
                        lastPosX = evt.clientX;
                        lastPosY = evt.clientY;
                        canvas.canvas.selection = false;
                    }
                });
                
                canvas.canvas.on('mouse:move', function(opt) {
                    if (isPanning) {
                        let evt = opt.e;
                        let vpt = canvas.canvas.viewportTransform;
                        vpt[4] += evt.clientX - lastPosX;
                        vpt[5] += evt.clientY - lastPosY;
                        canvas.canvas.requestRenderAll();
                        lastPosX = evt.clientX;
                        lastPosY = evt.clientY;
                    }
                });
                
                canvas.canvas.on('mouse:up', function(opt) {
                    isPanning = false;
                    canvas.canvas.selection = true;
                });
                
                canvas.on("mouse:wheel", (opt) => {
                    let delta = opt.e.deltaY;
                    let currentZoom = canvas.canvas.getZoom();
                    
                    // Limites de zoom
                    if (delta < 0 && currentZoom < 3) { // Zoom in max 3x
                        zoom += 1;
                        canvas.zoom(canvas.rel_pos(new Position(opt.e.clientX, opt.e.clientY)), 1.1);
                    } else if (delta > 0 && currentZoom > 0.3) { // Zoom out min 0.3x
                        zoom -= 1;
                        canvas.zoom(canvas.rel_pos(new Position(opt.e.clientX, opt.e.clientY)), 0.9090);
                    }
                    opt.e.preventDefault();
                    opt.e.stopPropagation();
                });

                canvas.on("mouse:over", (e) => {
                    if (e.target && e.target.shadow) {
                        e.target.shadow.blur = 100;
                    }
                });

                canvas.on("mouse:out", (e) => {
                    if (e.target && e.target.shadow) {
                        e.target.shadow.blur = 1;
                    }
                });

                $(window).on("resize", () => {
                    canvas.resize(window.innerWidth, window.innerHeight);
                });

                canvas.start();
                menu_mod(temp_engine, system);
                
                // Créer le panneau de status
                createStatusPanel();
                
                // Configurer la recherche de planètes
                setupPlanetSearch(planets, canvas);
            });
        });
        temp_engine.render("templates/system/system.html");
    }, (err) => {
        // Si le système n'existe pas, essayer de charger depuis les vaisseaux
        console.error("Error loading system:", err);
        
        if (tryShipSystem) {
            Ship.list((ships) => {
                if (ships.length > 0) {
                    let shipSystem = ships[0].nav.systemSymbol;
                    
                    // Vérifier si le système du vaisseau existe
                    if (shipSystem === sys_name) {
                        // Le vaisseau est dans le même système invalide
                        console.warn("Ship is in same invalid system, fetching from API");
                        // Récupérer un système valide depuis l'API publique
                        SystemBuilder.list(1, 1, (systems, meta) => {
                            if (systems && systems.length > 0) {
                                const validSystem = systems[0].name;
                                alert("System not found: " + sys_name + "\n\nYour agent was created before the API reset (2026-01-11).\nLoading system " + validSystem + " for demonstration.\n\nPlease create a new agent to access your actual systems.");
                                system(temp_engine, validSystem, false);
                            } else {
                                console.error("No systems returned from API");
                                alert("Cannot find any valid system. Your agent was created before the API reset.\nPlease create a new agent.");
                                home(temp_engine);
                            }
                        }, []);
                    } else {
                        system(temp_engine, shipSystem, false);
                    }
                } else {
                    alert("System not found: " + sys_name + "\n\nYour agent was created before the API reset (2026-01-11).\nPlease create a new agent to access your actual systems.");
                    home(temp_engine);
                }
            }, (err) => {
                console.error("Cannot list ships:", err);
                alert("System not found: " + sys_name + "\n\nYour agent was created before the API reset (2026-01-11).\nPlease create a new agent.");
                home(temp_engine);
            });
        } else {
            alert("System not found: " + sys_name);
            home(temp_engine);
        }
    });
}