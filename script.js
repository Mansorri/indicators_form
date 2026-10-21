
class Person {
  constructor(id, name, address, meter, readingsCount, accountStatus) {
    this.id = id;
    this.name = name;
    this.address = address;
    this.meter = meter;
    this.readingsCount = readingsCount;
    this.accountStatus = accountStatus;
  }

  isDtek() {
    return this.accountStatus === "dtek";
  }

  isComplete(readings) {
    return (
      !this.isDtek() &&
      Array.isArray(readings) &&
      readings.length === this.readingsCount &&
      readings.every(value =>
        Number.isSafeInteger(value) && value >= 0
      )
    );
  }

  matches(query) {
    const text = [
      this.id,
      this.name,
      this.address,
      this.meter
    ].join(" ").toLocaleLowerCase("uk");

    return text.includes(query.toLocaleLowerCase("uk"));
  }
}

class ReadingRepository {
  constructor(monthKey) {
    this.storageKey = `indicators-demo:${monthKey}`;
    this.data = this.load();
  }

  load() {
    try {
      const result = JSON.parse(
        localStorage.getItem(this.storageKey) || "{}"
      );

      return result &&
        typeof result === "object" &&
        !Array.isArray(result)
        ? result
        : {};
    } catch {
      return {};
    }
  }

  get(personId) {
    return this.data[personId] || null;
  }

  save(personId, readings) {
    const updated = {
      ...this.data,
      [personId]: readings
    };

    localStorage.setItem(
      this.storageKey,
      JSON.stringify(updated)
    );

    this.data = updated;
  }

  delete(personId) {
    const updated = { ...this.data };

    delete updated[personId];

    localStorage.setItem(
      this.storageKey,
      JSON.stringify(updated)
    );

    this.data = updated;
  }

  isComplete(person) {
    return person.isComplete(this.get(person.id));
  }
}

class IndicatorsApp {
  constructor(people, repository) {
    this.people = people;
    this.repository = repository;

    this.perPage = 10;
    this.page = 1;
    this.search = "";
    this.filter = "all";
    this.expanded = null;
    this.drafts = {};

    this.bindEvents();
    this.render();
  }

  element(id) {
    return document.getElementById(id);
  }

  escapeHTML(value) {
    return String(value).replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char])
    );
  }

  getVisiblePeople() {
    return this.people.filter(person => {
      if (!person.matches(this.search.trim())) {
        return false;
      }

      const completed = this.repository.isComplete(person);

      switch (this.filter) {
        case "done":
          return completed;

        case "todo":
          return !person.isDtek() && !completed;

        case "dtek":
          return person.isDtek();

        default:
          return true;
      }
    });
  }

  updateProgress() {
    const active = this.people.filter(
      person => !person.isDtek()
    );

    const completed = active.filter(
      person => this.repository.isComplete(person)
    );

    const percent = active.length
      ? Math.round(completed.length / active.length * 100)
      : 0;

    this.element("progressCount").textContent =
      `${completed.length} / ${active.length}`;

    this.element("percent").textContent = `${percent}%`;
    this.element("progressBar").style.width = `${percent}%`;

    this.element("totalCount").textContent =
      `${this.people.length} осіб`;
  }

  getStatus(person) {
    if (person.isDtek()) {
      return {
        className: "dtek",
        label: "ДТЕК"
      };
    }

    if (this.repository.isComplete(person)) {
      return {
        className: "done",
        label: "✓ Заповнено"
      };
    }

    return {
      className: "todo",
      label: "Не заповнено"
    };
  }

  renderPerson(person) {
    const status = this.getStatus(person);
    const isOpen = this.expanded === person.id;
    const stored = this.repository.get(person.id);

    const values = this.drafts[person.id] ||
      (person.isComplete(stored)
        ? stored.map(String)
        : Array(person.readingsCount).fill(""));

    let details = "";

    if (isOpen) {
      if (person.isDtek()) {
        details = `
          <div class="details">
            <div class="info">
              ДТЕК — показники для цієї особи не вводяться.
            </div>
          </div>
        `;
      } else {
        const fields = values.map((value, index) => `
          <div>
            <label for="r-${person.id}-${index}">
              Показник ${index + 1}
            </label>

            <input
              id="r-${person.id}-${index}"
              name="reading-${index}"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              value="${this.escapeHTML(value)}"
              placeholder="Введіть число"
            >
          </div>
        `).join("");

        details = `
          <div class="details">
            <div class="info">
              Лічильник:
              <strong>${this.escapeHTML(person.meter)}</strong>
              · Введіть ${person.readingsCount} показники
            </div>

            <form data-save="${person.id}">
              <div class="fields">
                ${fields}
              </div>

              <div class="actions">
                <button class="save" type="submit">
                  Зберегти показники
                </button>

                <span
                  class="message"
                  id="msg-${person.id}"
                  role="status"
                ></span>
              </div>
            </form>
          </div>
        `;
      }
    }

    return `
      <article class="person">
        <button
          class="person-head"
          type="button"
          data-open="${person.id}"
          aria-expanded="${isOpen}"
        >
          <span class="num">${person.id}</span>

          <span class="identity">
            <strong>${this.escapeHTML(person.name)}</strong>

            <small>
              ${this.escapeHTML(person.address)}
              · ${this.escapeHTML(person.meter)}
            </small>
          </span>

          <span class="status ${status.className}">
            ${status.label}
          </span>

          <span class="arrow">
            ${isOpen ? "⌃" : "⌄"}
          </span>
        </button>

        ${details}
      </article>
    `;
  }

  render() {
    this.updateProgress();

    const filtered = this.getVisiblePeople();

    const maxPage = Math.max(
      1,
      Math.ceil(filtered.length / this.perPage)
    );

    this.page = Math.min(this.page, maxPage);

    const start = (this.page - 1) * this.perPage;
    const shown = filtered.slice(
      start,
      start + this.perPage
    );

    this.element("results").textContent =
      `Знайдено: ${filtered.length} · Показано: ${shown.length}`;

    this.element("pageInfo").textContent =
      `Сторінка ${this.page} з ${maxPage}`;

    this.element("prev").disabled = this.page === 1;
    this.element("next").disabled = this.page === maxPage;

    this.element("list").innerHTML = shown.length
      ? shown.map(person => this.renderPerson(person)).join("")
      : '<div class="panel muted">Нікого не знайдено.</div>';
  }

  saveReadings(form) {
    const id = Number(form.dataset.save);

    const person = this.people.find(
      item => item.id === id
    );

    if (!person || person.isDtek()) {
      return;
    }

    const raw = Array.from(
      { length: person.readingsCount },
      (_, index) =>
        form.elements.namedItem(`reading-${index}`).value.trim()
    );

    const message = this.element(`msg-${id}`);
    const allEmpty = raw.every(value => value === "");

    const valid = raw.every(value =>
      /^\d+$/.test(value) &&
      Number.isSafeInteger(Number(value))
    );

    if (!allEmpty && !valid) {
      message.textContent =
        "Заповніть усі поля або очистіть усі для видалення показників.";

      message.classList.add("error");
      return;
    }

    try {
      if (allEmpty) {
        this.repository.delete(id);
      } else {
        this.repository.save(id, raw.map(Number));
      }

      delete this.drafts[id];

      this.render();

      const updatedMessage = this.element(`msg-${id}`);

      if (updatedMessage) {
        updatedMessage.textContent = allEmpty
          ? "Показники видалено ✓"
          : "Показники збережено ✓";

        updatedMessage.classList.remove("error");
      }
    } catch {
      message.textContent = "Не вдалося зберегти зміни.";
      message.classList.add("error");
    }
  }

  bindEvents() {
    this.element("search").addEventListener("input", event => {
      this.search = event.target.value;
      this.page = 1;
      this.expanded = null;
      this.render();
    });

    this.element("filter").addEventListener("change", event => {
      this.filter = event.target.value;
      this.page = 1;
      this.expanded = null;
      this.render();
    });

    this.element("prev").addEventListener("click", () => {
      this.page--;
      this.expanded = null;
      this.render();
    });

    this.element("next").addEventListener("click", () => {
      this.page++;
      this.expanded = null;
      this.render();
    });

    this.element("list").addEventListener("click", event => {
      const button = event.target.closest("[data-open]");

      if (!button) {
        return;
      }

      const id = Number(button.dataset.open);

      this.expanded = this.expanded === id ? null : id;
      this.render();
    });

    this.element("list").addEventListener("input", event => {
      if (!event.target.matches('input[name^="reading-"]')) {
        return;
      }

      const form = event.target.closest("form");
      const id = Number(form.dataset.save);

      const person = this.people.find(
        item => item.id === id
      );

      if (!person) {
        return;
      }

      this.drafts[id] = Array.from(
        { length: person.readingsCount },
        (_, index) =>
          form.elements.namedItem(`reading-${index}`).value
      );
    });

    this.element("list").addEventListener("submit", event => {
      const form = event.target.closest("form[data-save]");

      if (!form) {
        return;
      }

      event.preventDefault();
      this.saveReadings(form);
    });
  }
}

function createDemoPeople() {
  return Array.from({ length: 73 }, (_, index) => {
    const id = index + 1;
    const isDtek = id % 11 === 0;

    return new Person(
      id,
      `Особа ${id}`,
      `Демонстраційна адреса ${id}`,
      `DEMO-${String(id).padStart(4, "0")}`,
      isDtek ? 0 : (index % 3) + 1,
      isDtek ? "dtek" : "active"
    );
  });
}

const now = new Date();

const monthKey = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0")
].join("-");

document.getElementById("period").textContent =
  new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric"
  }).format(now);

const repository = new ReadingRepository(monthKey);
const people = createDemoPeople();

new IndicatorsApp(people, repository);
