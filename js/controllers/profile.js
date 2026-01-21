import menu_mod from "./menu_mod.js";
import { Auth } from "../skama_code/auth/auth.js"
import { My } from "../skama_code/commun/my.js"
import { clearAllServices } from "../skama_code/services/index.js";
import { showSnackbar } from "../skama_code/ui/notifications.js";
import login from "./login.js";

export default function profile(temp_engine) {
    temp_engine.after_render(() => {
        $("body").css("background-image", "url('/assets/profile/background.png')")
        $('#name').append(My.agent.name);
        $('#faction').append(My.agent.faction);
        $('#credit').append(My.agent.credits);
        $('#hq').append(My.agent.hq);
        $('#shipcount').append(My.agent.ships_cpt);

        temp_engine.add_event('#btn-token', 'click', () => {
            navigator.clipboard.writeText(My.agent.token);
            showSnackbar('Token copied to clipboard!', 'success');
        });

        temp_engine.add_event('#btn-logout', 'click', () => {
            const auth = new Auth();
            auth.unload_token();
            
            // Nettoyer tous les services (cache, tokens, stats)
            clearAllServices();
            
            My.agent = null;
            showSnackbar('Logged out successfully!', 'success');
            login(temp_engine);
        });

        menu_mod(temp_engine, null);
    });
    temp_engine.render("/templates/profile/profile.html");
}