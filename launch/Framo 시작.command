#!/bin/bash
# 더블클릭하면 Framo를 켜고 크롬(없으면 엣지)으로 엽니다. 이 PC 안에서만 열려요.
# 서버가 아니라 시작 프로그램(dist-node/launch.mjs)을 켠다. 받아서 풀어 둔 새 버전(versions/)이 있으면 그 버전이 켜진다.
cd "$(dirname "$0")" || exit 1

# 함께 들어 있는 Node.js를 이 맥에 맞게 고른다 (애플 실리콘은 arm64, 인텔은 x64). 없으면 설치된 Node.js를 쓴다
case "$(uname -m)" in
  arm64) NODE="node/arm64/node" ;;
  *) NODE="node/x64/node" ;;
esac
if [ -x "$NODE" ]; then
  # 인터넷에서 받은 zip을 풀면 안의 파일마다 '받은 파일' 표시가 붙어, 함께 넣은 Node.js도 처음에 막힐 수 있다.
  # 이 파일을 열어 주셨으면 같이 받은 Node.js도 연다 (nodejs.org의 공식 파일을 묶을 때 체크섬으로 확인해 두었다)
  xattr -d com.apple.quarantine "$NODE" 2>/dev/null
elif command -v node >/dev/null 2>&1; then
  NODE="node"
else
  echo "Node.js를 찾지 못했어요. 받은 zip 파일을 통째로 다시 풀어 주세요."
  echo "node 폴더가 없는 판이라면 https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -r -p "창을 닫으려면 Enter를 누르세요."
  exit 1
fi

if [ ! -f dist/index.html ] || [ ! -f dist-node/launch.mjs ]; then
  if [ -d node_modules ]; then
    echo "처음 실행이라 화면 파일을 만들고 있어요..."
    npm run build || { read -r -p "만들지 못했어요. Enter를 누르면 닫혀요."; exit 1; }
  else
    echo "화면 파일(dist)이 없어요. 받은 Framo 폴더를 통째로 다시 풀어 주세요."
    read -r -p "창을 닫으려면 Enter를 누르세요."
    exit 1
  fi
fi

echo "Framo를 켜고 있어요. 발표를 만드는 동안 이 창은 닫지 말고 내려 두세요 (닫으면 Framo가 꺼져요)."
"$NODE" dist-node/launch.mjs
