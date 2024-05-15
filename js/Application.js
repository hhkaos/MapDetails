/*
 Copyright 2022 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

const reactiveUtils = await $arcgis.import("esri/core/reactiveUtils");

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";
import SignIn from './apl/SignIn.js';
import ViewLoading from './apl/ViewLoading.js';

import UserContent from './apl/UserContent.js';
import LivingAtlasContent from './apl/LivingAtlasContent.js';

//import MapScale from './apl/MapScale.js';

class Application extends AppBase {

  // PORTAL //
  portal = null;

  // WEB MAP PORTAL ITEM //
  mapPortalItem = null;

  // DEFAULT WEB MAP ID //
  defaultWebMapId = null;

  // MAP VIEW //
  mapView = null;

  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // SET APPLICATION DETAILS //
        this.setApplicationDetails({map, group});

        // STARTUP DIALOG //
        this.initializeStartupDialog();

        // VIEW SHAREABLE URL PARAMETERS //
        this.initializeViewShareable({view});

        // USER SIGN-IN //
        this.configUserSignIn();

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').toggleAttribute('hidden', true);
          //console.info("Application ready...");
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   */
  configUserSignIn() {

    const signInContainer = document.getElementById('sign-in-container');
    if (signInContainer) {
      const signIn = new SignIn({container: signInContainer, portal: this.portal});
    }

  }

  /**
   *
   * @param view
   */
  configView({view}) {
    return new Promise(async (resolve, reject) => {
      if (view) {

        // VIEW AND POPUP //
        const Popup = await $arcgis.import("esri/widgets/Popup");
        view.set({
          constraints: {snapToZoom: false},
          popup: new Popup({
            dockEnabled: true,
            dockOptions: {
              buttonEnabled: false,
              breakpoint: false,
              position: "top-right"
            }
          })
        });

        // SEARCH //
        // const Search = await $arcgis.import("esri/widgets/Search");
        // const search = new Search({view: view});
        // view.ui.add(search, {position: 'top-left', index: 0});

        // HOME //
        const Home = await $arcgis.import("esri/widgets/Home");
        const home = new Home({view});
        view.ui.add(home, {position: 'top-left', index: 1});

        // COMPASS //
        // const Compass = await $arcgis.import("esri/widgets/Compass");
        // const compass = new Compass({view: view});
        // view.ui.add(compass, {position: 'top-left', index: 2});
        // reactiveUtils.watch(() => view.rotation, rotation => {
        //   compass.set({visible: (rotation > 0)});
        // }, {initial: true});

        // MAP SCALE //
        // const mapScale = new MapScale({view});
        // view.ui.add(mapScale, {position: 'bottom-left', index: 0});

        // VIEW LOADING INDICATOR //
        const viewLoading = new ViewLoading({view: view});
        view.ui.add(viewLoading, 'bottom-right');

        // LAYER LIST //
        document.getElementById('layers-container').innerHTML = '';
        const LayerList = await $arcgis.import("esri/widgets/LayerList");
        const layerList = new LayerList({
          container: 'layers-container',
          view: view,
          visibleElements: {
            errors: true,
            statusIndicators: true
          }
        });

        // LEGEND //
        const legendSwitch = document.getElementById('legend-switch');
        const Legend = await $arcgis.import("esri/widgets/Legend");
        // document.getElementById('legend-container').innerHTML = '';
        // const legend = new Legend({container: 'legend-container', view: view});
        this.legend = new Legend({
          view: view,
          visible: legendSwitch.checked
        });
        view.ui.add(this.legend, {position: 'bottom-left'});

        reactiveUtils.whenOnce(() => !view.updating).then(resolve).catch(reject);
        //resolve();

      } else { resolve(); }
    });
  }

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView({view}).then(() => {

        this.mapView = view;
        this.mapPortalItem = this.mapView.map.portalItem;
        this.defaultWebMapId = this.mapPortalItem.id;

        this.initializeMapDisplay();
        this.initializeMapViewScreenshots();
        this.initializeMapViewChanges();

        this.createMapLists();
        this.initializeWebMapById();
        this.initializeGenAI();

        this.initializeLogResults();

        resolve();
      }).catch(reject);
    });
  }

  /**
   *
   */
  async initializeMapDisplay() {

    const WebMap = await $arcgis.import("esri/WebMap");
    const MapView = await $arcgis.import("esri/views/MapView");

    const {container} = this.mapView;

    this.updateMapDisplay = async () => {

      if (this.mapView.map.portalItem.id !== this.mapPortalItem?.id) {
        document.getElementById('app-loader').toggleAttribute('hidden', false);

        this.mapView.destroy();

        const webMapId = this.mapPortalItem?.id || this.defaultWebMapId;
        const webMap = new WebMap({portalItem: {id: webMapId}});
        webMap.load().then(() => {

          this.mapView = new MapView({container, map: webMap});
          this.configView({view: this.mapView}).then(() => {
            this.enableViewChangeUpdates();
            document.getElementById('app-loader').toggleAttribute('hidden', true);
          });

        }).catch((error) => {
          this.displayError(error);
        });

      }
    };

  }

  /**
   *
   */
  async initializeMapViewChanges() {

    const Handles = await $arcgis.import("esri/core/Handles");
    const viewHandles = new Handles();

    this.enableViewChangeUpdates = () => {
      if (this.mapView) {

        const viewUpdateHandle = reactiveUtils.when(() => !this.mapView.updating, () => {
          this.createScreenshot();
        }, {initial: true});

        viewHandles.add(viewUpdateHandle);

      } else {
        viewHandles.removeAll();
      }
    };

    this.enableViewChangeUpdates();
  }

  /**
   *
   */
  initializeMapViewScreenshots() {

    let _screenshotBlob = null;
    let abortController = new AbortController();

    const mapScreenshot = document.getElementById('map-screenshot');

    const legendSwitch = document.getElementById('legend-switch');
    legendSwitch.addEventListener('calciteSwitchChange', () => {
      this.legend.visible = legendSwitch.checked;
      this.createScreenshot();
    });

    const generateDescriptionBtn = document.getElementById('generate-description-btn');
    generateDescriptionBtn.addEventListener('click', () => {

      generateDescriptionBtn.toggleAttribute('disabled', true);
      generateDescriptionBtn.toggleAttribute('loading', true);
      this.generateMapDescriptionFromScreenshot({screenshotBlob: _screenshotBlob}).then(() => {
        generateDescriptionBtn.toggleAttribute('loading', false);
        generateDescriptionBtn.toggleAttribute('disabled', false);
      });

    });

    this.clearScreenshot = () => { mapScreenshot.src = ''; };

    this.createScreenshot = () => {
      if (this.mapView) {

        abortController?.abort();
        abortController = new AbortController();

        generateDescriptionBtn.toggleAttribute('disabled', true);
        this.mapView.takeScreenshot().then(async (screenshot) => {
          generateDescriptionBtn.toggleAttribute('disabled', false);
          if (!abortController.signal.aborted) {

            const mapCanvas = document.createElement('canvas');
            mapCanvas.width = this.mapView.width;
            mapCanvas.height = this.mapView.height;
            const mapCtx = mapCanvas.getContext('2d');
            mapCtx.putImageData(screenshot.data, 0, 0);

            if (legendSwitch.checked) {
              //
              // https://html2canvas.hertzen.com/
              // https://html2canvas.hertzen.com/documentation
              //
              const legendCanvas = await html2canvas(this.legend.container, {backgroundColor: null});
              mapCtx.drawImage(legendCanvas, 0, mapCanvas.height - legendCanvas.height, legendCanvas.width, legendCanvas.height);

            }

            //
            // https://stackoverflow.com/questions/19262141/resize-image-with-javascript-canvas-smoothly
            //
            createImageBitmap(mapCanvas, {
              resizeWidth: mapCanvas.width * 0.5,
              resizeHeight: mapCanvas.height * 0.5,
              resizeQuality: 'high'
            }).then(async imageBitmap => {

              const mapResizeCanvas = document.createElement('canvas');
              mapResizeCanvas.width = imageBitmap.width;
              mapResizeCanvas.height = imageBitmap.height;
              const mapResizeCtx = mapResizeCanvas.getContext('2d');
              mapResizeCtx.drawImage(imageBitmap, 0, 0);
              const mapDataUrl = mapResizeCanvas.toDataURL('image/png');
              mapScreenshot.src = mapDataUrl;

              _screenshotBlob = await fetch(mapDataUrl).then(res => res.blob());
            });

          }
        });

      }
    };
  }

  /**
   *
   */
  async initializeWebMapById() {

    const PortalItem = await $arcgis.import("esri/portal/PortalItem");

    const webMapIdInput = document.getElementById('web-map-id-input');
    const webMapIdAction = document.getElementById('web-map-id-action');

    const itemIDPattern = /^[0-9a-f]{32}$/i;

    const checkItemID = (itemID) => {
      return itemIDPattern.test(itemID);
    };

    const validateItemID = () => {
      const itemID = webMapIdInput.value || '';

      webMapIdInput.status = (!itemID.length)
        ? 'idle'
        : checkItemID(itemID) ? 'valid' : 'invalid';

      webMapIdAction.toggleAttribute('disabled', webMapIdInput.status !== 'valid');
    };

    webMapIdInput.addEventListener('calciteInputTextInput', () => {
      validateItemID();
    });

    /*this.addEventListener('web-map-change', ({detail: {mapPortalItem}}) => {
      webMapIdInput.value = mapPortalItem?.id || '';
      validateItemID();
    });*/

    webMapIdAction.addEventListener('click', () => {
      const webMapPortalItem = new PortalItem({id: webMapIdInput.value});
      this.setCurrentMap(webMapPortalItem);
    });

  }

  /**
   *
   * @param mapItem
   * @return {Promise<>}
   */
  async setCurrentMap(mapItem) {

    this.mapPortalItem = mapItem;
    if (this.mapPortalItem != null) {
      await this.mapPortalItem?.load();
    }
    await this.updateMapDisplay();
    this.clearScreenshot();
    this.clearAIDescription();
    this.updateAIPrompt();

    const mapCardTitle = document.getElementById('map-card-title');
    const mapCardSubtitle = document.getElementById('map-card-subtitle');
    const mapCardDescription = document.getElementById('map-card-description');
    const webMapLink = document.getElementById('web-map-link');

    mapCardTitle.innerText = this.mapPortalItem?.title.trim() || '[missing title]';
    mapCardTitle.title = this.mapPortalItem?.id || '';
    mapCardSubtitle.innerText = this.mapPortalItem?.snippet.trim() || '[missing summary]';
    mapCardDescription.innerHTML = this.mapPortalItem?.description.trim() || '';

    webMapLink.setAttribute('href', !this.mapPortalItem ? '' : `https://www.arcgis.com/home/item.html?id=${ this.mapPortalItem.id }`);
    webMapLink.toggleAttribute('disabled', !this.mapPortalItem);

    this.dispatchEvent(new CustomEvent('web-map-change', {detail: {mapPortalItem: this.mapPortalItem}}));
  };

  /**
   *
   * @return {Promise<>}
   */
  createMapLists() {
    return new Promise(async (resolve, reject) => {

      const userContent = new UserContent({
        container: 'user-content-container',
        portal: this.portal
      });
      userContent.addEventListener('portal-item-selected', ({detail: {portalItem}}) => {
        if (this.mapPortalItem?.id !== portalItem?.id) {
          this.setCurrentMap(portalItem);
        }
      });

      const livingAtlasContent = new LivingAtlasContent({
        container: 'living-atlas-container',
        portal: this.portal
      });
      livingAtlasContent.addEventListener('portal-item-selected', ({detail: {portalItem}}) => {
        if (this.mapPortalItem?.id !== portalItem?.id) {
          this.setCurrentMap(portalItem);
        }
      });

      resolve();
    });
  }

  /**
   *
   */
  initializeGenAI() {

    // GenAI ASSISTANT URL //
    const assistantURL = "https://dev0027589.esri.com:4892/api/assistant";

    // PORTAL URL AND TOKEN //
    const {url: portalUrl, credential: {token}} = this.portal;

    // AI PROMPT //
    const aiPrompt = document.getElementById('ai-prompt');
    // GENERATED DESCRIPTION //
    const aiDescription = document.getElementById('ai-description');

    this.clearAIDescription = () => {
      aiPrompt.value = '...';
      aiDescription.innerText = '';
      aiDescription.classList.remove('invalid');
    };

    const snippetSwitch = document.getElementById('snippet-switch');
    snippetSwitch.addEventListener('calciteSwitchChange', () => {
      this.updateAIPrompt();
    });

    const wordLimitSelect = document.getElementById('word-limit-select');
    wordLimitSelect.addEventListener('calciteSelectChange', () => {
      this.updateAIPrompt();
    });

    this.updateAIPrompt = () => {

      if (this.mapPortalItem) {

        const promptTemplates = [
          `provided this map of ${ this.mapPortalItem.title } about ${ this.mapPortalItem.snippet.toLowerCase() }, please describe what you see`,
          `provided this map of ${ this.mapPortalItem.title }, please describe what you see`,
          `tell me more about this map called '${ this.mapPortalItem.title }' about ${ this.mapPortalItem.snippet.toLowerCase() } - what it might contain, provide very detailed description`,
          `tell me more about this map called '${ this.mapPortalItem.title }' - what it might contain, provide very detailed description`,
          `here's a map about ${ this.mapPortalItem.title } related to ${ this.mapPortalItem.snippet.toLowerCase() } - describe what it contains and provide a very detailed description`,
          `here's a map about ${ this.mapPortalItem.title } - describe what it contains and provide a very detailed description`
        ];

        // PROMPT INFO //
        let promptTemplate = snippetSwitch.checked && (this.mapPortalItem?.title !== this.mapPortalItem?.snippet)
          ? promptTemplates.at(4)
          : promptTemplates.at(5);

        // WORD LIMIT //
        const wordLimit = Number(wordLimitSelect.value);
        if (wordLimit) {
          promptTemplate += ` in less than ${ wordLimit } words`;
        }

        // PROMPT //
        aiPrompt.value = promptTemplate;

      } else {
        // PROMPT //
        aiPrompt.value = '...';
      }
    };

    /**
     *
     * @param screenshot
     * @return {Promise<void>}
     */
    this.generateMapDescriptionFromScreenshot = async ({screenshotBlob}) => {

      const promptInfo = {'name': 'key1', 'prompt': aiPrompt.value};

      const formData = new FormData();
      formData.append("f", "json");
      formData.append("stream", "false");
      formData.append("intent", "survey123.tools.image2text.ImageToTextTool.ImageToTextTool");
      formData.append("includeKeysInResult", "true");
      formData.append("attributes", JSON.stringify([promptInfo]));
      formData.append("portalUrl", portalUrl);
      formData.append("token", token);
      formData.append("file", screenshotBlob, "Image.jpeg");

      const requestOptions = {
        method: "POST",
        body: formData,
        redirect: "follow"
      };

      aiDescription.innerHTML = '';
      aiDescription.classList.remove('invalid');

      return fetch(assistantURL, requestOptions).then((response) => response.json()).then((response) => {
        console.info(response);

        if (response.success) {
          aiDescription.innerHTML = response.results?.at(0)?.value || 'Unrecognizable';
          aiDescription.classList.remove('invalid');
        } else {
          aiDescription.innerHTML = `Unable to generate a valid description fot this Web Map: ${ JSON.stringify(response.error, null, 2) }`;
          aiDescription.classList.add('invalid');
        }

        return response;
      }).catch((error) => {
        this.displayError(error);
      });

    };
  }

  /**
   *
   */
  initializeLogResults() {

    const logResults = Boolean(this.logResults);
    if (logResults) {

      const resultsBlock = document.getElementById('results-block');
      resultsBlock.toggleAttribute('hidden', false);

      const resultsTable = document.getElementById('results-table');

      const mapScreenshot = document.getElementById('map-screenshot');
      const aiPrompt = document.getElementById('ai-prompt');
      const aiDescription = document.getElementById('ai-description');

      const resultsSaveAction = document.getElementById('results-save-action');
      resultsSaveAction.addEventListener('click', () => {

        const webmapid = this.mapPortalItem.id;
        const prompt = aiPrompt.value;
        const description = aiDescription.innerText;

        const screenshot = document.createElement('img');
        screenshot.width = 80;
        screenshot.src = mapScreenshot.src;

        const resultCells = [webmapid, screenshot, prompt, description].map((result, resultIdx) => {
          const resultCell = document.createElement('calcite-table-cell');
          if (resultIdx === 1) {
            resultCell.append(result);
          } else {
            resultCell.innerHTML = result;
          }
          return resultCell;
        });
        const resultRow = document.createElement('calcite-table-row');
        resultRow.append(...resultCells);
        resultsTable.append(resultRow);

      });

    }

  }

}

export default new Application();
