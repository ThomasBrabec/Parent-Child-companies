exports.main = async (context = {}, sendResponse) => {
  // simpele proof-of-life
  return sendResponse({
    status: "ok",
    message: "Ping from HubSpot Project works",
    contactId: context?.event?.object?.objectId ?? null
  });
};
