"use strict";

const demo = document.querySelector("#twist-demo");
const replayButton = document.querySelector("#replay-twist-demo");

function replayDemo(flavour = demo.dataset.flavour || "yellow") {
  demo.classList.remove("is-playing");
  demo.dataset.flavour = flavour;
  void demo.offsetWidth;
  demo.classList.add("is-playing");
}

function chooseFlavour(event) {
  const chamber = event.target.closest(".demo-chamber-choice");
  if (!chamber) return;
  replayDemo(chamber.classList.contains("demo-chamber-yellow") ? "yellow" : "red");
}

demo.addEventListener("click", chooseFlavour);
demo.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (!event.target.matches(".demo-chamber-choice")) return;
  event.preventDefault();
  replayDemo(event.target.classList.contains("demo-chamber-yellow") ? "yellow" : "red");
});
replayButton.addEventListener("click", replayDemo);
replayDemo("yellow");
