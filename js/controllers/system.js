/**
 * System Controller - Affichage et navigation du système solaire
 * 
 * Ce fichier a été refactoré pour utiliser les modules suivants :
 * - notifications.js : Snackbars et modals
 * - fuel_manager.js : Gestion du carburant
 * - contract_manager.js : Gestion des contrats
 * - planet_helpers.js : Fonctions utilitaires pour les planètes
 * - status_panel.js : Panneau de status
 */

import menu_mod from "./menu_mod.js";
import home from "./home.js";
import { CanvasRenderer } from "../skama_code/ui/canvas_render.js";
import { SystemBuilder } from "../skama_code/api/system.js";
import { Position } from "../skama_code/commun/position.js";
import { Ship } from "../skama_code/api/ship.js";

// Import des services
import { spaceTradersClient, statisticsTracker, fleetManager, cacheService } from "../skama_code/services/index.js";

// Import des modules UI refactorisés
import { showSnackbar, showInfoModal } from "../skama_code/ui/notifications.js";
import { get_img_from_type, get_scale_from_type, showPlanetInfo } from "../skama_code/ui/planet_helpers.js";
import { createStatusPanelFactory, setupPlanetSearch } from "../skama_code/ui/status_panel.js";

/**
 * Fonction principale du contrôleur de système
 * @param {Object} temp_engine - Moteur de templating
 * @param {string} sys_name - Nom du système à afficher
 * @param {boolean} tryShipSystem - Essayer de charger depuis les vaisseaux si le système n'existe pas
 */
export default function system(temp_engine, sys_name, tryShipSystem = false) {
    // Créer le factory pour le status panel
    const statusPanelFactory = createStatusPanelFactory();
    
    // Exposer updateStatusPanel globalement pour les fonctions des autres modules
    window.updateStatusPanel = statusPanelFactory.updateStatusPanel;
    
    // Nettoyer le panneau existant
    $("#status-panel").remove();
    
    // Vérifie d'abord si le système existe avant de rendre le template
    SystemBuilder.get(sys_name, (systemData) => {
        // Le système existe, on peut rendre le template
        temp_engine.after_render(() => {
            $("body").css("background-image", "url('/assets/planets/backgroundcanvas.png')");
            let canvas = new CanvasRenderer("sys-canvas", 1200, 700);
            canvas.resize(window.innerWidth, window.innerHeight);
            
            systemData.list_all_planets((planets) => {
                canvas.clean();
                planets.forEach((planet) => {
                    let urls = get_img_from_type(planet);
                    if (urls.length) {
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
                menu_mod(temp_engine, systemData);
                
                // Créer le panneau de status
                statusPanelFactory.createStatusPanel();
                
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
                                showInfoModal('System Not Found', `System not found: ${sys_name}\n\nYour agent was created before the API reset (2026-01-11).\nLoading system ${validSystem} for demonstration.\n\nPlease create a new agent to access your actual systems.`, () => {
                                    system(temp_engine, validSystem, false);
                                });
                            } else {
                                console.error("No systems returned from API");
                                showInfoModal('Error', 'Cannot find any valid system. Your agent was created before the API reset.\nPlease create a new agent.', () => {
                                    home(temp_engine);
                                });
                            }
                        }, []);
                    } else {
                        system(temp_engine, shipSystem, false);
                    }
                } else {
                    showInfoModal('System Not Found', `System not found: ${sys_name}\n\nYour agent was created before the API reset (2026-01-11).\nPlease create a new agent to access your actual systems.`, () => {
                        home(temp_engine);
                    });
                }
            }, (err) => {
                console.error("Cannot list ships:", err);
                showInfoModal('System Not Found', `System not found: ${sys_name}\n\nYour agent was created before the API reset (2026-01-11).\nPlease create a new agent.`, () => {
                    home(temp_engine);
                });
            });
        } else {
            showSnackbar("System not found: " + sys_name, 'error');
            home(temp_engine);
        }
    });
}
