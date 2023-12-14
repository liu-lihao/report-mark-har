import { computed, defineComponent, onBeforeUnmount, ref } from "vue";
import {
  NInput,
  NRadioGroup,
  NRadioButton,
  NUpload,
  NUploadDragger,
  NText,
  NButton,
  useMessage,
  NSpin,
} from "naive-ui";

const useEffect = (fn: Function) => {
  const cb = fn();
  onBeforeUnmount(() => {
    if (typeof cb === "function") {
      cb();
    }
  });
};

const _cache: Record<string, string> = {};
const getUrlFilename = (url: string) => {
  if (url in _cache) {
    return _cache[url];
  }
  const name = url.split("/").slice(-1)[0].split("?")[0];
  _cache[url] = name.includes(".") ? name : "";
  return _cache[url];
};

const getHarFilenames = async (harFile: File) => {
  const text = await harFile.text();
  const filenames = JSON.parse(text)
    .log.entries.map((n: any) => getUrlFilename(n.request.url))
    .filter(Boolean);
  return filenames;
};

const countBy = (arr: any[]) => {
  const obj = {} as Record<string, number>;
  arr.forEach((n) => {
    obj[n] = (obj[n] || 0) + 1;
  });
  return obj;
};

const renderDownloadIcon = () => (
  <svg
    class="w-[1em] h-[1em] ml-1"
    viewBox="0 0 1024 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
  >
    <path d="M480 224a32 32 0 0 1 64 0v448a32 32 0 0 1-64 0z"></path>
    <path d="M800 832V672a32 32 0 0 1 64 0v192a32 32 0 0 1-32 32H192a32 32 0 0 1-32-32V672a32 32 0 0 1 64 0v160z"></path>
    <path d="M648.32 522.24a32 32 0 1 1 47.36 43.52l-176 192a32 32 0 0 1-47.36 0l-176-192a32 32 0 1 1 47.36-43.52L496 688.64z"></path>
  </svg>
);

const REPORT_SPECIAL_TEXT = "this.handleConcatenatedModulesContentToggle";

export const App = defineComponent({
  setup() {
    const type = ref("url");
    const url = ref("");
    const fileList = ref<{ file: File }[]>([]);
    const harFileList = ref<{ file: File }[]>([]);
    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const loading = ref(false);

    // @ts-ignore
    window.getUrlFilename = getUrlFilename;

    const fileCacheDataMap = new WeakMap();
    const realGetHarFilenameMap = async (harFile: File) => {
      if (fileCacheDataMap.has(harFile)) {
        return fileCacheDataMap.get(harFile).data;
      }
      const filenames = await getHarFilenames(harFile);
      const filenameMap = countBy(filenames);
      fileCacheDataMap.set(harFile, { data: filenameMap });
      return filenameMap;
    };

    const canConfirm = computed(() => {
      if (type.value === "file") {
        return !!fileList.value.length && !!harFileList.value.length;
      }
      return !!url.value && !!harFileList.value.length;
    });

    const message = useMessage();
    const handleConfirm = async () => {
      loading.value = true;
      try {
        let reportText = "";
        if (type.value === "url") {
          reportText = await fetch(url.value, { method: "GET" }).then((res) =>
            res.status < 400
              ? res.text()
              : Promise.reject("Report is" + res.status)
          );
        } else {
          reportText = await fileList.value[0].file.text();
        }
        if (!reportText.includes(REPORT_SPECIAL_TEXT)) {
          throw new Error("report.html Error");
        }
        const harFilenameMap = await realGetHarFilenameMap(
          harFileList.value[0].file
        );
        // 1. expose reactVm & trigger done event
        reportText = reportText.replace(
          REPORT_SPECIAL_TEXT,
          `((window.parent.__vv__ = this) && (window.parent.dispatchEvent(new Event("report-done"))) && false),${REPORT_SPECIAL_TEXT}`
        );
        // 2. remove mousemove hide menu * 2
        reportText = reportText.replace("this.toggleVisibility(!1)", "(1)");
        reportText = reportText.replace("this.toggleVisibility(!1)", "(1)");
        // 3. inject getUrlFilename() and harFilenameMap
        reportText = reportText.replace(
          "window.chartData =",
          `window.getUrlFilename = window.parent.getUrlFilename;window.__vvMap__ = ${JSON.stringify(
            harFilenameMap
          )};window.chartData =`
        );
        // 4. replace checkbox label render name
        reportText = reportText.replace(
          "`${n} (`",
          `\`\${window.__vvMap__[window.getUrlFilename(n)] ? '✅' + n : n} (\``
        );
        iframeRef.value!.srcdoc = reportText;
      } catch (error: any) {
        console.log("error", error);
        message.error(error?.message || JSON.stringify(error));
        loading.value = false;
      }
    };

    useEffect(() => {
      const handleDone = () => {
        // @ts-ignore
        const reactVm = window.__vv__;
        setTimeout(async () => {
          reactVm.props.pinned = true;
          reactVm.setState({ showChunkContextMenu: true });
          reactVm.handleSidebarPinStateChange(true);
          loading.value = false;
          const harFilenameMap = await realGetHarFilenameMap(
            harFileList.value[0].file
          );
          reactVm.handleSelectedChunksChange(
            reactVm.chunkItems.filter((n: any) => {
              const chunkName = getUrlFilename(n.label);
              return !!harFilenameMap[chunkName];
            })
          );
        }, 500);
      };
      window.addEventListener("report-done", handleDone);
      return () => window.removeEventListener("report-done", handleDone);
    });

    return () => {
      const inputReport = (
        <div class="space-y-4 flex-1">
          <div class="flex space-x-2 items-center">
            <NRadioGroup v-model:value={type.value} name="type">
              <NRadioButton value="url">URL</NRadioButton>
              <NRadioButton value="file">FILE</NRadioButton>
            </NRadioGroup>
            <div>report.html</div>
          </div>
          <NInput
            v-show={type.value === "url"}
            v-model:value={url.value}
            placeholder={"Please enter the URL of report.html"}
          ></NInput>
          <NUpload
            v-show={type.value === "file"}
            v-model:file-list={fileList.value}
            showTrigger={!fileList.value.length}
            max={1}
          >
            <NUploadDragger>
              <NText style="font-size: 16px">
                Please click or drag report.html here
              </NText>
            </NUploadDragger>
          </NUpload>
        </div>
      );
      const inputHar = (
        <div class="space-y-4 flex-1">
          <div class="flex space-x-2 items-center">
            <NRadioGroup value="file" name="reportType">
              <NRadioButton value="file">FILE</NRadioButton>
            </NRadioGroup>
            <div class="flex items-center text-[22px]">
              .har
              <div class="flex ml-4 items-center text-[16px] text-[#aaa]">
                Chrome DevTools Network Export HAR at {renderDownloadIcon()}
              </div>
            </div>
          </div>
          <NUpload
            v-model:file-list={harFileList.value}
            max={1}
            showTrigger={!harFileList.value.length}
          >
            <NUploadDragger>
              <NText style="font-size: 16px">
                Please click or drag .har here
              </NText>
            </NUploadDragger>
          </NUpload>
        </div>
      );

      return (
        <div class="p-4 flex flex-col h-[100dvh] space-y-2">
          <div class="flex space-x-4 min-h-[116px]">
            <div class="font-bold text-[24px] text-center flex flex-col items-center justify-center">
              <div>First Screen</div>
              <div>Resource</div>
              <div>Visualization</div>
            </div>
            {inputHar}
            {inputReport}
            <div class="flex items-center">
              <NButton
                disabled={!canConfirm.value}
                loading={loading.value}
                onClick={handleConfirm}
                type="primary"
                style="height: 100%;"
              >
                Confirm
              </NButton>
            </div>
          </div>
          <div class="w-full flex-1 relative">
            <NSpin
              v-show={loading.value}
              class="absolute top-1/2 left-1/2 translate-x-1/2 translate-y-1/2"
            />
            <iframe ref={iframeRef} class="w-full h-full"></iframe>
          </div>
        </div>
      );
    };
  },
});
