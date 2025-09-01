const axios = require("axios");

const HS = axios.create({
  baseURL: "https://api.hubapi.com",
  headers: { Authorization: `Bearer ${process.env.PRIVATE_APP_TOKEN}` }
});

// Hulpfunctie: zoek het juiste association typeId via label
async function getTypeId(from, to, labelSub) {
  const { data } = await HS.get(`/crm/v4/associations/${from}/${to}/labels`);
  const hit = (data.results || []).find(
    r => r.category === "HUBSPOT_DEFINED" &&
         (r.label || "").toLowerCase().includes(labelSub)
  );
  if (!hit) throw new Error(`Association label '${labelSub}' not found for ${from}->${to}`);
  return hit.typeId;
}

exports.main = async (context = {}, sendResponse) => {
  try {
    const contactId = String(context?.event?.object?.objectId ?? context?.event?.objectId);
    if (!contactId) return sendResponse({ status: "no-contact" });

    // Huidige companies van het contact
    const { data: assocCompanies } =
      await HS.get(`/crm/v4/objects/contacts/${contactId}/associations/companies`);
    const contactCompanyIds = new Set(
      (assocCompanies.results || []).map(r => String(r.toObjectId))
    );
    if (contactCompanyIds.size === 0)
      return sendResponse({ status: "no-company-on-contact" });

    // Association typeIds ophalen
    const childToParentTypeId = await getTypeId("companies","companies","child");
    const contactToCompanyTypeId = await getTypeId("contacts","companies","default");

    // Ouders zoeken
    const parentIds = new Set();
    for (const childId of contactCompanyIds) {
      const { data } = await HS.get(
        `/crm/v4/objects/companies/${childId}/associations/companies`,
        { params: { associationTypeId: childToParentTypeId } }
      );
      (data.results || []).forEach(r => parentIds.add(String(r.toObjectId)));
    }
    if (parentIds.size === 0) return sendResponse({ status: "no-parent-found" });

    // Bestaande koppelingen checken
    const { data: currentAll } =
      await HS.get(`/crm/v4/objects/contacts/${contactId}/associations/companies`);
    const already = new Set((currentAll.results || []).map(r => String(r.toObjectId)));

    const toCreate = [...parentIds].filter(id => !already.has(id));
    if (toCreate.length === 0) return sendResponse({ status: "already-associated" });

    // Nieuwe associaties maken
    const payload = {
      inputs: toCreate.map(parentId => ({
        from: { id: contactId },
        to:   { id: parentId },
        types: [{
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: contactToCompanyTypeId
        }]
      }))
    };
    await HS.post(`/crm/v4/associations/contacts/companies/batch/create`, payload);

    return sendResponse({ status: "ok", created: toCreate });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    return sendResponse({ status: "error", message: e.message });
  }
};
