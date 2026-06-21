export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function expandAccordion(page, buttonPattern) {
  const button = page.getByRole('button', { name: buttonPattern });
  await button.waitFor({ state: 'visible', timeout: 30000 });
  const expanded = await button.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await button.click();
  }
}

export async function selectRadioByLabel(page, labelPattern) {
  const radio = page.getByRole('radio', { name: labelPattern });
  await radio.waitFor({ state: 'attached', timeout: 30000 });
  await radio.click({ force: true });
}

export async function navigateToDateTimeStep(page, config) {
  const branchPattern = new RegExp(escapeRegex(config.branch), 'i');
  const servicePattern = new RegExp(escapeRegex(config.service), 'i');

  await page.getByRole('heading', { name: /reserva de cita/i }).waitFor({
    state: 'visible',
    timeout: config.timeout_seconds * 1000,
  });

  await expandAccordion(page, /Seleccionar sucursal/i);
  await selectRadioByLabel(page, branchPattern);

  await expandAccordion(page, /Seleccionar servicio/i);
  await selectRadioByLabel(page, servicePattern);

  await expandAccordion(page, /Seleccionar fecha y hora/i);
  await page.waitForTimeout(2500);
}

export async function detectNoSlotsMessage(page) {
  const patterns = [
    /no hay citas disponibles/i,
    /no hay citas disponible/i,
    /inténtelo mas tarde/i,
    /intente mas tarde/i,
  ];

  for (const pattern of patterns) {
    const el = page.getByText(pattern);
    if (await el.count()) {
      const visible = await el.first().isVisible().catch(() => false);
      if (visible) {
        return (await el.first().innerText()).trim();
      }
    }
  }
  return null;
}

export async function findAvailableSlots(page) {
  const slots = [];
  const timeSelectors = [
    '[class*="timeslot" i]:not([disabled])',
    '[class*="time-slot" i]:not([disabled])',
    '[data-testid*="timeslot" i]',
    'button[class*="slot" i]:not([disabled])',
    '.qm-timeslot:not(.disabled)',
  ];

  for (const selector of timeSelectors) {
    const elements = page.locator(selector);
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      const text = (await el.innerText()).trim();
      if (text && /\d{1,2}[:.]\d{2}/.test(text)) {
        slots.push({ text: text.replace(/\s+/g, ' '), locator: el });
      }
    }
  }

  return slots;
}

export async function clickFirstAvailableSlot(page) {
  const slots = await findAvailableSlots(page);
  if (!slots.length) return null;
  await slots[0].locator.click();
  await page.waitForTimeout(2000);
  return slots[0].text;
}

export async function fillContactForm(page, profile) {
  await page.getByRole('button', { name: /DETALLES DE CONTACTO|Detalles de contacto/i }).click().catch(() => {});
  await page.waitForTimeout(1500);

  const fields = [
    { label: /^Nombre$/i, value: profile.nombre },
    { label: /^Apellido$/i, value: profile.apellidos },
    { label: /NIE|Pasaporte|CustRef/i, value: profile.dni },
    { label: /correo electr[oó]nico/i, value: profile.email },
    { label: /tel[eé]fono|m[oó]vil/i, value: profile.telefono },
  ];

  for (const { label, value } of fields) {
    const input = page.getByLabel(label).first();
    if (await input.count()) {
      await input.fill(value);
      continue;
    }
    const byRole = page.getByRole('textbox', { name: label }).first();
    if (await byRole.count()) {
      await byRole.fill(value);
    }
  }

  await fillCustomField(page, profile.numero_expediente);
  await acceptTerms(page);
}

async function fillCustomField(page, value) {
  const selectors = [
    page.getByLabel(/expediente/i),
    page.locator('input[name="Numero_expediente"]'),
    page.locator('[id*="Numero_expediente"]'),
    page.locator('label:has-text("expediente")').locator('..').locator('input'),
  ];

  for (const el of selectors) {
    if (await el.count() && await el.first().isVisible().catch(() => false)) {
      await el.first().fill(value);
      return;
    }
  }
}

async function acceptTerms(page) {
  const termsCheckbox = page.getByRole('checkbox', {
    name: /t[eé]rminos|condiciones|privacidad|agreement/i,
  }).first();

  if (await termsCheckbox.count()) {
    const checked = await termsCheckbox.isChecked().catch(() => false);
    if (!checked) await termsCheckbox.click({ force: true });
  }
}

export async function triggerEmailVerification(page) {
  const verifyButtons = [
    page.getByRole('button', {
      name: /enviar c[oó]digo al correo|enviar c[oó]digo|verificar.*correo/i,
    }),
    page.locator('button.send-verification-btn'),
  ];

  for (const btn of verifyButtons) {
    if (await btn.count() && await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await page.waitForTimeout(2500);
      return true;
    }
  }

  return false;
}

export async function enterVerificationCode(page, code) {
  const dialog = page.locator('[role="dialog"], .v-dialog').first();
  const dialogVisible = await dialog.isVisible().catch(() => false);

  const scope = dialogVisible ? dialog : page;

  const otpInputs = scope.locator(
    'input[type="number"], input[inputmode="numeric"], .v-otp-input input, [class*="otp"] input',
  );
  const count = await otpInputs.count();

  if (count === 1) {
    await otpInputs.first().fill(code);
  } else if (count > 1) {
    for (let i = 0; i < Math.min(count, code.length); i++) {
      await otpInputs.nth(i).fill(code[i]);
    }
  } else {
    const textInput = scope.getByLabel(/c[oó]digo de verificaci[oó]n/i).first();
    if (await textInput.count()) {
      await textInput.fill(code);
    } else {
      const fallback = scope.locator('input').first();
      if (await fallback.count()) {
        await fallback.fill(code);
      }
    }
  }

  const verifyBtn = scope.getByRole('button', { name: /^Verificar$/i }).first();
  if (await verifyBtn.count() && await verifyBtn.isVisible().catch(() => false)) {
    await verifyBtn.click();
    await page.waitForTimeout(2500);
  }
}

export async function submitBooking(page) {
  const submitButtons = [
    page.getByRole('button', { name: /reservar cita|confirmar|pagar.*reservar|submit/i }),
    page.locator('button.submit-btn:not(.submit-disabled-btn)'),
  ];

  for (const btn of submitButtons) {
    if (await btn.count() && await btn.first().isVisible().catch(() => false)) {
      const disabled = await btn.first().isDisabled().catch(() => true);
      if (!disabled) {
        await btn.first().click();
        await page.waitForTimeout(3000);
        return true;
      }
    }
  }
  return false;
}

export async function detectCaptcha(page) {
  const recaptcha = page.locator('#g-recaptcha-response, iframe[src*="recaptcha"], .g-recaptcha');
  if (await recaptcha.count()) {
    const frame = page.frameLocator('iframe[src*="recaptcha"]').first();
    if (await frame.locator('.rc-anchor-content').count().catch(() => 0)) {
      return true;
    }
  }

  const body = await page.locator('body').innerText().catch(() => '');
  return /captcha|recaptcha|no soy un robot/i.test(body);
}

export async function detectBookingSuccess(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  const successPatterns = [
    /su reserva ha sido registrada/i,
    /confirmaci[oó]n ha sido enviada/i,
    /cita.*confirmada/i,
    /reserva.*confirmada/i,
    /appointment.*confirmed/i,
  ];
  return successPatterns.some((p) => p.test(body));
}

export async function detectBookingError(page) {
  const body = await page.locator('body').innerText().catch(() => '');
  const errorPatterns = [
    /no se puede reservar/i,
    /error.*reserv/i,
    /captcha/i,
    /demasiados intentos/i,
    /expir/i,
  ];
  for (const p of errorPatterns) {
    if (p.test(body)) return body.match(p)[0];
  }
  return null;
}
