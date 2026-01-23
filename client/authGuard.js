(function () {
  if (!window.netlifyIdentity) {
    window.location.replace("/login.html");
    return;
  }

  window.netlifyIdentity.on("init", (user) => {
    if (!user) window.location.replace("/login.html");
  });

  window.netlifyIdentity.init();
})();
