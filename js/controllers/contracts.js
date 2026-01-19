"use strict";

import menu_mod from "./menu_mod.js";
import { Contract } from "../skama_code/api/contract.js";
import { Modal } from "../skama_code/ui/modal.js";

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
              alert(errorMsg);
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

      contracts.forEach(contract => {
        let img
        let status
        let card

        if (contract.type = "PROCUREMENT") {
          img = "/assets/contracts/procurement.png"
        }
        else if (contract.type = "TRANSPORT") {
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

    })
    temp_engine.add_event(".btn-close", "click", () => {
      modal.close();
    });
    menu_mod(temp_engine, null);
  });
  temp_engine.render("templates/contracts/contracts.html")
}
