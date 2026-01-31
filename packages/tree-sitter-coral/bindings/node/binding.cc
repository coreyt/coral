#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" TSLanguage *tree_sitter_coral();

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports["name"] = Napi::String::New(env, "coral");
    auto language = Napi::External<TSLanguage>::New(env, tree_sitter_coral());
    exports["language"] = language;
    return exports;
}

NODE_API_MODULE(tree_sitter_coral_binding, Init)
