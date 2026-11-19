// App bootstrap. Firebase initialization will be added after the project
// configuration and security model are ready.

const status = document.querySelector("#connection-status");

if (status) {
  status.textContent = "Setup in progress";
}
