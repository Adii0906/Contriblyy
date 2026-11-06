export const INTRO_KEY = "contribly:intro-seen";

export const INTRO_BOOT_SCRIPT = `(function(){try{if(location.pathname!=="/")return;var d=document.documentElement;var force=/[?&]intro=1(?:&|$)/.test(location.search);var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(force||(!reduce&&!localStorage.getItem('${INTRO_KEY}'))){d.setAttribute('data-intro','play');}}catch(e){}})();`;
