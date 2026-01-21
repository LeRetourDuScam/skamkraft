"use strict";

import menu_mod from "./menu_mod.js";
import { Contract } from "../skama_code/api/contract.js"
import { showSnackbar, showConfirmModal } from "../skama_code/ui/notifications.js";
import { Modal } from "../skama_code/ui/modal.js";
import { Ship } from "../skama_code/api/ship.js";

export default function contracts(temp_engine) {
  // Supprimer le panneau de status du système
  if (window.cleanupSystemStatusPanel) {
    window.cleanupSystemStatusPanel();
  }
  
  temp_engine.after_render(menu_mod);

  let modal = new Modal("contracts-modal", temp_engine);

  temp_engine.after_render((temp_engine) => {
    $("body").css("background-image", "url('/assets/contracts/screen_background.png')")
    modal.load("templates/contracts/contracts_modal.html");

    Contract.list(10, 1, (contracts) => {
      //Evenements accepter
      temp_engine.add_event(".btn-accept", "click", (e) => {
        let button = $(e.target);
        
        // Empêcher les clics multiples
        if (button.prop("disabled")) {
          return;
        }
        
        button.prop("disabled", true);
        button.html("Processing...");
        
        contracts.forEach((contract) => {
          if (button.attr("data-id") == contract.id) {
            contract.accept(() => {
              button.parent().children(".status-onhold").html("Status : accepté");
              button.parent().children(".status-onhold").attr("class", 'status-accepted');
              button.html("Contract accepted");
            }, (err) => {
              // Restaurer le bouton en cas d'erreur
              button.prop("disabled", false);
              button.html("Accepter");
              
              let errorMsg = "Failed to accept contract";
              if (err.responseJSON && err.responseJSON.error) {
                errorMsg = err.responseJSON.error.message;
              }
              showSnackbar(errorMsg, 'error');
            });
          }
        });
      });
      //Evenement infos
      temp_engine.add_event(".btn-infos", "click", (e) => {
        contracts.forEach((contract) => {
          const id_contract = $(e.target).attr("data-id");
          $(".contract-id").text("ID : " + contract.id);
          $(".contract-faction").text("Faction : " + contract.faction);
          $(".contract-type").text("Type : " + contract.type);
          $(".contract-expiration").text("Expiration : " + contract.expiration);
          $(".contract-payment-accepted").text("Payment : " + contract.paymentAccepted + " $");
          $(".contract-payment-fulfill").text("Payment fulfill : " + contract.paymentFulfill + " $");
          $(".contract-tradeSymbol").text("Trade Symbol : " + contract.tradeSymbol);
          $(".contract-destinationSymbol").text("Destination : " + contract.destination);
          modal.show();
        });
      });

      // Vider le conteneur avant d'ajouter les contrats
      $('.contracts').empty();
      
      contracts.forEach(contract => {
        let img
        let status
        let card

        if (contract.type === "PROCUREMENT") {
          img = "/assets/contracts/procurement.png"
        }
        else if (contract.type === "TRANSPORT") {
          img = "/assets/contracts/transportation.png"
        }
        else {
          img = "/assets/contracts/shuttle.png"
        }

        if (contract.accepted) {
          status = "accepted"
          let fulfilled = contract.fulfilled ? "COMPLETED" : "IN PROGRESS";
          let fulfilledColor = contract.fulfilled ? "#00ff00" : "#ffaa00";
          let deliveryProgress = "";
          
          if (contract.deliver && contract.deliver.length > 0) {
            contract.deliver.forEach(delivery => {
              let progress = delivery.unitsFulfilled || 0;
              let total = delivery.unitsRequired || 0;
              let percentage = total > 0 ? Math.round((progress / total) * 100) : 0;
              deliveryProgress += `
                <div style="margin: 10px 0; font-size: 12px;">
                  <div>${delivery.tradeSymbol}: ${progress}/${total} (${percentage}%)</div>
                  <div style="background: #333; height: 10px; border-radius: 5px; overflow: hidden;">
                    <div style="background: ${percentage === 100 ? '#00ff00' : '#00aaff'}; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
                  </div>
                </div>
              `;
            });
          }
          
          card =
            `                            
                    <div class="card">
                      <img src="${img}" class="card-img-top" alt="">
                      <div class="card-body">
                        <h5 style="color:white" class="card-title">${contract.faction}</h5>
                        <p style="color:white" class="card-text">${contract.deadline}</p>
                        <p class="card-text status-accepted">Status: ${status}</p>
                        <p style="color: ${fulfilledColor}; font-weight: bold;">${fulfilled}</p>
                        ${deliveryProgress}                     
                      </div>
                      <div class="card-button">
                        <button data-id="${contract.id}" type="button" class="btn btn-primary btn-infos" data-bs-toggle="modal" data-bs-target="#exampleModal">Infos</button> 
                        <button data-id="${contract.id}" class="btn-modify btn btn-primary btn-accept" data-toggle="modal" data-target="#Modify" >Contract accepted</button>  
                      </div>
                    </div>
            `
        }

        else {
          status = "on hold"
          card =
            `                            
                    <div class="card">
                      <img src="${img}" class="card-img-top" alt="">
                      <div class="card-body">                  
                          <h5 style="color:white" class="card-title">${contract.faction}</h5>
                          <p style="color:white" class="card-text">${contract.deadline}</p>
                          <p class="card-text status-onhold">Status : ${status}</p>                                        
                          <p></p>                        
                      </div>
                      <div class="card-button">
                        <button type="button" class="btn-infos" data-bs-toggle="modal" data-bs-target="#exampleModal">Infos</button>
                        <button data-id="${contract.id}" class="btn-accept" data-toggle="modal" data-target="#Modify" >Accepter</button>                       
                      </div>
                    </div>
            `
        }
        $('.contracts').append(card);
        
      });
      
      // Si aucun contrat actif, afficher un message avec option de négocier
      if (contracts.length === 0) {
        $('.contracts').html(`
          <div style="text-align: center; padding: 40px; color: white;">
            <h3>📋 No active contracts</h3>
            <p>All your contracts are completed! Visit a faction headquarters to negotiate new contracts.</p>
          </div>
        `);
      }
      
      // Event pour négocier un nouveau contrat
      $("#btn-negotiate").off("click").on("click", function() {
        showNegotiateModal();
      });

    })
    temp_engine.add_event(".btn-close", "click", () => {
      modal.close();
    });
    menu_mod(temp_engine, null);
  });
  temp_engine.render("templates/contracts/contracts.html")
}

/**
 * Affiche la modal pour négocier un nouveau contrat
 */
function showNegotiateModal() {
  Ship.list((ships) => {
    // Filtrer les vaisseaux dockés
    const dockedShips = ships.filter(s => s.nav.status === 'DOCKED');
    
    if (dockedShips.length === 0) {
      showSnackbar("No docked ships available. Dock a ship at a faction HQ to negotiate.", 'warning');
      return;
    }
    
    let shipsHTML = dockedShips.map(ship => `
      <button class="negotiate-ship-btn" data-ship="${ship.symbol}" 
          style="display: block; width: 100%; margin: 8px 0; padding: 15px; 
          background: linear-gradient(135deg, #1a1a3a, #2a2a4a); color: white; 
          border: 1px solid #00ffff; border-radius: 8px; cursor: pointer; text-align: left;">
        <div style="font-weight: bold; font-size: 14px;">🚀 ${ship.symbol}</div>
        <div style="font-size: 12px; color: #aaa; margin-top: 5px;">
          📍 ${ship.nav.waypointSymbol} | Status: ${ship.nav.status}
        </div>
      </button>
    `).join('');
    
    let modalHTML = `
      <div id="negotiate-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
          background: rgba(0, 0, 0, 0.95); color: white; padding: 25px; border-radius: 12px; 
          border: 2px solid #00ffff; z-index: 10000; min-width: 400px; max-width: 500px;
          box-shadow: 0 0 30px rgba(0, 255, 255, 0.4);">
        <h2 style="margin-top: 0; color: #00ffff; border-bottom: 2px solid #00ffff; padding-bottom: 10px;">
          🤝 Negotiate New Contract
        </h2>
        <p style="color: #aaa; font-size: 13px; margin-bottom: 15px;">
          Select a docked ship to negotiate a new contract. The ship must be at a faction headquarters.
        </p>
        <div style="max-height: 300px; overflow-y: auto;">
          ${shipsHTML}
        </div>
        <button id="close-negotiate-modal" style="margin-top: 15px; padding: 12px 20px; 
            background: #ff4444; color: white; border: none; border-radius: 5px; 
            cursor: pointer; font-weight: bold; width: 100%;">Cancel</button>
      </div>
      <div id="negotiate-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
          background: rgba(0, 0, 0, 0.7); z-index: 9999;"></div>
    `;
    
    $("body").append(modalHTML);
    
    // Fermer la modal
    $("#close-negotiate-modal, #negotiate-overlay").on("click", function() {
      $("#negotiate-modal").remove();
      $("#negotiate-overlay").remove();
    });
    
    // Négocier avec le vaisseau sélectionné
    $(".negotiate-ship-btn").on("click", function() {
      const shipSymbol = $(this).data("ship");
      const btn = $(this);
      
      btn.prop("disabled", true);
      btn.css("opacity", "0.5");
      btn.find("div:first").html("⏳ Negotiating...");
      
      Contract.negotiate(shipSymbol, (newContract) => {
        $("#negotiate-modal").remove();
        $("#negotiate-overlay").remove();
        showSnackbar(`✅ New contract negotiated! Type: ${newContract.type}, Payment: ${newContract.paymentFulfill} credits`, 'success', 5000);
        // Recharger la page pour voir le nouveau contrat
        setTimeout(() => {
          location.reload();
        }, 1500);
      }, (errorMsg) => {
        btn.prop("disabled", false);
        btn.css("opacity", "1");
        btn.find("div:first").html(`🚀 ${shipSymbol}`);
        showSnackbar(errorMsg, 'error', 5000);
      });
    });
    
  }, (err) => {
    showSnackbar("Failed to load ships", 'error');
  });
}
