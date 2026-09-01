let currentStep = 1;

let uploadedFiles = [];

let lastResult = null;


// --------------------------------
// START
// --------------------------------

function startSystem() {

    document
        .getElementById("welcome")
        .classList.add("hidden");

    document
        .getElementById("wizard")
        .classList.remove("hidden");

    goStep(1);
}


// --------------------------------
// CHANGE STEP
// --------------------------------

function goStep(step) {

    currentStep = step;

    document
        .querySelectorAll(".step")
        .forEach(function(element) {

            element.classList.add("hidden");

        });


    const target =
        document.querySelector(
            `.step[data-step="${step}"]`
        );


    if (target) {

        target.classList.remove("hidden");
    }


    document
        .getElementById("stepNumber")
        .textContent =
        `STEP ${step} OF 7`;


    document
        .getElementById("progressBar")
        .style.width =
        `${(step / 7) * 100}%`;


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// --------------------------------
// FILE SELECT
// --------------------------------

document
    .getElementById("materials")
    .addEventListener(
        "change",
        function() {

            uploadedFiles =
                Array.from(this.files);


            const list =
                document.getElementById(
                    "fileList"
                );


            list.innerHTML = "";


            uploadedFiles.forEach(
                function(file) {

                    const item =
                        document.createElement(
                            "div"
                        );

                    item.className =
                        "file-item";

                    item.textContent =
                        "✓ " + file.name;

                    list.appendChild(item);

                }
            );
        }
    );


// --------------------------------
// STEP 1 CONTINUE
// --------------------------------

function nextFromUpload() {

    if (
        uploadedFiles.length === 0
    ) {

        alert(
            "Please upload at least one file."
        );

        return;
    }

    goStep(2);
}


// --------------------------------
// PROCESS MATERIAL
// --------------------------------

async function processMaterial() {

    if (
        uploadedFiles.length === 0
    ) {

        alert(
            "Please upload your material first."
        );

        goStep(1);

        return;
    }


    goStep(3);


    const formData =
        new FormData();


    uploadedFiles.forEach(
        function(file) {

            formData.append(
                "materials",
                file
            );
        }
    );


    formData.append(
        "author",
        document
            .getElementById("author")
            .value ||
        "Not provided"
    );


    formData.append(
        "year",
        document
            .getElementById("year")
            .value
    );


    formData.append(
        "title",
        document
            .getElementById("title")
            .value
    );


    formData.append(
        "journal",
        document
            .getElementById("journal")
            .value
    );


    formData.append(
        "reference",
        document
            .getElementById("reference")
            .value
    );


    try {

        const response =
            await fetch(
                "/api/upload",
                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message
            );
        }


        document
            .getElementById(
                "processingText"
            )
            .textContent =
            `${data.materials.length} file(s) processed successfully.`;


        setTimeout(
            function() {

                goStep(4);

            },
            1000
        );


    } catch(error) {

        document
            .getElementById(
                "processingText"
            )
            .textContent =
            "Error: " +
            error.message;
    }
}


// --------------------------------
// QUICK QUESTION
// --------------------------------

function setQuestion(text) {

    document
        .getElementById("question")
        .value = text;
}


// --------------------------------
// ASK QUESTION
// --------------------------------

async function askQuestion() {

    const question =
        document
            .getElementById("question")
            .value
            .trim();


    if (!question) {

        alert(
            "Please enter a question."
        );

        return;
    }


    goStep(5);


    document
        .getElementById("answer")
        .textContent =
        "Searching your uploaded material...";


    try {

        const response =
            await fetch(
                "/api/ask",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            question:
                                question
                        })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message
            );
        }


        lastResult = data;


        document
            .getElementById("answer")
            .textContent =
            data.answer;


        showSources(
            data.sources
        );


        showConceptMap(
            data.concepts
        );


    } catch(error) {

        document
            .getElementById("answer")
            .textContent =
            error.message;
    }
}


// --------------------------------
// SOURCE TRACE
// --------------------------------

function showSources(sources) {

    const container =
        document.getElementById(
            "sources"
        );


    if (
        !sources ||
        sources.length === 0
    ) {

        container.innerHTML =
            "<p>No matching source found.</p>";

        return;
    }


    container.innerHTML =
        sources
            .map(function(source) {

                return `
                    <div class="source">

                        <b>
                            ${escapeHTML(
                                source.title
                            )}
                        </b>

                        <small>
                            Author:
                            ${escapeHTML(
                                source.author
                            )}

                            ·

                            Year:
                            ${escapeHTML(
                                source.year ||
                                "Not provided"
                            )}
                        </small>

                        <small>
                            File:
                            ${escapeHTML(
                                source.fileName
                            )}
                        </small>

                        <small>
                            ${escapeHTML(
                                source.excerpt
                            )}
                        </small>

                    </div>
                `;

            })
            .join("");
}


function toggleSources() {

    document
        .getElementById("sources")
        .classList.toggle(
            "hidden"
        );
}


// --------------------------------
// CONCEPT MAP
// --------------------------------

function showConceptMap(
    concepts
) {

    const map =
        document.getElementById(
            "conceptMap"
        );


    map.innerHTML = "";


    const center =
        document.createElement(
            "div"
        );


    center.className =
        "concept-center";


    center.textContent =
        document
            .getElementById(
                "question"
            )
            .value;


    map.appendChild(center);


    concepts.forEach(
        function(concept) {

            const node =
                document.createElement(
                    "div"
                );


            node.className =
                "concept-node";


            node.textContent =
                concept;


            map.appendChild(node);

        }
    );
}


// --------------------------------
// FINAL REFERENCE
// --------------------------------

async function showFinalReference() {

    goStep(7);


    try {

        const response =
            await fetch(
                "/api/materials"
            );


        const materials =
            await response.json();


        if (
            materials.length === 0
        ) {

            document
                .getElementById(
                    "finalReference"
                )
                .textContent =
                "No material uploaded.";

            return;
        }


        const latest =
            materials[0];


        const referenceResponse =
            await fetch(
                `/api/reference/${latest.id}`
            );


        const data =
            await referenceResponse.json();


        document
            .getElementById(
                "finalReference"
            )
            .textContent =
            data.reference;


    } catch(error) {

        document
            .getElementById(
                "finalReference"
            )
            .textContent =
            "Could not load reference.";
    }
}


// --------------------------------
// SECURITY
// --------------------------------

function escapeHTML(value) {

    return String(value || "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}