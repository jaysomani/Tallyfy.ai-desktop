// tallyAPI.js
const axios = require('axios');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });
const TALLY_URL ='http://127.0.0.1:9000'; // Adjust as needed

class TallyAPIError extends Error {}

class TallyAPI {
  constructor(cacheTimeout = 10) {
    this.serverUrl = TALLY_URL;
    this.cacheTimeout = cacheTimeout;
    this.cache = {};
    this.companyCache = null;
    this.companyCacheTime = 0;
  }

  async isTallyRunning() {
    try {
      console.log("[isTallyRunning] Sending GET request to:", this.serverUrl);
      const response = await axios.get(this.serverUrl, { timeout: 5000 });
      console.log("[isTallyRunning] Received response with status:", response.status);
      console.log("[isTallyRunning] Response data:", response.data);
      return response.status === 200;
    } catch (err) {
      console.error("[isTallyRunning] Error:", err.message);
      return false;
    }
  }
  
  

  async sendRequest(xmlRequest) {
    console.log("[sendRequest] Preparing to send XML request:", xmlRequest);
    if (!(await this.isTallyRunning())) {
      console.error("[sendRequest] Tally is not accessible.");
      throw new TallyAPIError('Tally is not accessible.');
    }
    try {
      const response = await axios.post(this.serverUrl, xmlRequest, {
        headers: { 'Content-Type': 'text/xml' }
      });
      console.log("[sendRequest] Received response status:", response.status);
      console.log("[sendRequest] Raw response data:", response.data);
      const cleanedData = this.cleanXml(response.data);
      console.log("[sendRequest] Cleaned XML:", cleanedData);
      return cleanedData;
    } catch (err) {
      console.error("[sendRequest] Error:", err.message);
      throw new TallyAPIError(`Tally request error: ${err.message}`);
    }
  }
  

  cleanXml(text) {
    // Simple cleaning, similar to your Python regex logic.
    return text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '').trim();
  }

  _generateRequest(requestType, requestId, fetchFields = null, collectionType = "Ledger") {
    const fieldsXml = fetchFields ? `<FETCH>${fetchFields.join(', ')}</FETCH>` : "";
    return `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>${requestType}</TYPE>
          <ID>${requestId}</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="${requestId}" ISMODIFY="No">
                  <TYPE>${collectionType}</TYPE>
                  ${fieldsXml}
                </COLLECTION>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `.trim();
  }

  async getActiveCompany(useCache = true) {
    const now = Date.now();
    if (useCache && this.companyCache && (now - this.companyCacheTime) < this.cacheTimeout * 1000) {
      console.log("[getActiveCompany] Returning cached company:", this.companyCache);
      return this.companyCache;
    }
    const xmlRequest = this._generateRequest("Function", "$$CurrentCompany");
    console.log("[getActiveCompany] Generated XML Request:", xmlRequest);
    const responseXml = await this.sendRequest(xmlRequest);
    console.log("[getActiveCompany] Response XML:", responseXml);
    try {
      const result = await parser.parseStringPromise(responseXml);
      console.log("[getActiveCompany] Parsed XML result:", result);
      const companyNode = result?.ENVELOPE?.BODY?.DATA?.RESULT;
      const companyName = typeof companyNode === 'object' 
        ? companyNode._ 
        : companyNode;
      const company = companyName || "Unknown (Tally not responding)";
      console.log("[getActiveCompany] Extracted company:", company);
      this.companyCache = company;
      this.companyCacheTime = now;
      return company;
    } catch (parseErr) {
      console.error("[getActiveCompany] XML Parsing error:", parseErr.message);
      return "Unknown (Parsing Error)";
    }
  }
  

  async fetch_data(requestId, collectionType = "Ledger", fetchFields = [], useCache = true) {
    const now = Date.now();
    const cacheKey = requestId;
    if (useCache && this.cache[cacheKey] && (now - this.cache[cacheKey].time) < this.cacheTimeout * 1000) {
      return this.cache[cacheKey].data;
    }
    const xmlRequest = this._generateRequest("Collection", requestId, fetchFields, collectionType);
    const responseXml = await this.sendRequest(xmlRequest);
    let data = [];
    try {
      const result = await parser.parseStringPromise(responseXml);
      // Drill down into the ledger nodes.
      const items = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.[collectionType.toUpperCase()];
      if (items) {
        // Ensure we have an array of ledger items.
        const collection = Array.isArray(items) ? items : [items];
        data = collection.map(item => {
          const itemData = {};
          fetchFields.forEach(field => {
            let key = field.toUpperCase();
            let value = item[key] || "N/A";
            // If the value is an object with a "_" property, extract the text.
            if (typeof value === "object" && value._) {
              value = value._;
            }
            // For LEDGERNAME, fall back to the attribute NAME if necessary.
            if (key === "LEDGERNAME" && (value === "N/A" || !value)) {
              value = item.$ && item.$.NAME ? item.$.NAME : "N/A";
            }
            itemData[field] = (typeof value === "string" ? value : "N/A").trim();
          });
          // Also, store the attribute "NAME" as "Name" if available.
          if (item.$ && item.$.NAME) {
            itemData["Name"] = item.$.NAME;
          }
          return itemData;
        });
      }
    } catch (err) {
      console.error("XML Parsing error:", err);
    }
    this.cache[cacheKey] = { time: now, data };
    return data;
  }
}  

module.exports = { TallyAPI, TallyAPIError };