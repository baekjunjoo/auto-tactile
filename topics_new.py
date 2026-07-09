import json

topics = {
    "생물": [
        # 포유류
        "lion","elephant","giraffe","zebra","horse","cow","pig","sheep","goat","deer",
        "rabbit","fox","wolf","bear","tiger","leopard","cheetah","monkey","gorilla",
        "kangaroo","camel","rhinoceros","hippopotamus","panda","koala","squirrel",
        "hedgehog","bat","dog","cat","mouse","hamster","donkey","buffalo","moose",
        "bison","meerkat","otter","beaver","raccoon","skunk","armadillo","sloth",
        "platypus","wombat","tapir","jaguar","lynx","coyote","hyena","mole","ferret",
        # 해양생물
        "dolphin","whale","shark","octopus","squid","crab","lobster","shrimp",
        "seahorse","jellyfish","starfish","seal","walrus","clam","fish","stingray",
        "eel","coral","penguin","sea turtle","manatee","narwhal","anglerfish",
        "clownfish","pufferfish","swordfish","manta ray","sea horse","sea lion",
        # 조류
        "owl","eagle","hawk","parrot","peacock","swan","duck","rooster","flamingo",
        "ostrich","pelican","pigeon","robin","sparrow","crow","toucan","woodpecker",
        "hummingbird","crane","heron","albatross","puffin","kiwi","cockatoo",
        "macaw","canary","dove","vulture","falcon","stork","kingfisher",
        # 파충류/양서류
        "crocodile","alligator","snake","turtle","tortoise","frog","toad","lizard",
        "gecko","chameleon","iguana","komodo dragon","salamander","newt","axolotl",
        # 곤충/절지류
        "butterfly","bee","ant","spider","snail","ladybug","beetle","dragonfly",
        "grasshopper","moth","caterpillar","scorpion","worm","firefly","mosquito",
        "praying mantis","centipede","cricket","cicada","wasp","cockroach",
        # 공룡
        "tyrannosaurus rex","triceratops","stegosaurus","brachiosaurus","velociraptor",
        "pterodactyl","ankylosaurus","spinosaurus","diplodocus","parasaurolophus",
        # 식물
        "tree","palm","cactus","mushroom","flower","rose","sunflower","tulip",
        "daisy","leaf","acorn","fern","bamboo","clover","seedling","vine","ivy",
        "wheat","grass","oak","maple","cherry blossom","lotus","orchid","lavender",
        "dandelion","pine tree","seaweed","moss","thorn","petal","bonsai",
        # 신체
        "hand","eye","tooth","skull","brain","heart","lung","kidney","bone",
        "skeleton","ear","nose","foot","muscle","stomach","liver","cell","neuron",
        "dna","fingerprint","spine","rib","jaw","tongue","blood cell",
    ],
    "생활": [
        # 건물/가구
        "house","home","chair","table","lamp","clock","key","bell","umbrella",
        "scissors","book","teacup","cup","teapot","candle","basket","mirror",
        "broom","bucket","spoon","fork","knife","plate","bottle","glass","jar",
        "box","bag","backpack","wallet","glasses","watch","ring","crown",
        "envelope","sofa","bed","desk","shelf","door","window","stairs","fence",
        "mailbox","fireplace","bathtub","toilet","sink","refrigerator","oven",
        # 통신/전자
        "phone","camera","television","radio","computer","laptop","keyboard",
        "battery","plug","robot","telephone","headphone","speaker","printer",
        "projector","microwave","washing machine","vacuum cleaner","iron","fan",
        "air conditioner","calculator","remote control","game controller",
        # 도구
        "hammer","wrench","screwdriver","saw","drill","pliers","axe","shovel",
        "rake","nail","screw","gear","magnet","ladder","ruler","pencil","pen",
        "brush","paintbrush","compass","magnifying glass","scissors","tape",
        "stapler","eraser","thumbtack","paper clip","glue","needle","thread",
        # 교통
        "car","bus","train","airplane","sailboat","boat","ship","bicycle","bike",
        "motorcycle","truck","rocket","anchor","helicopter","scooter","tractor",
        "submarine","wheel","tire","taxi","ambulance","fire truck","police car",
        "hot air balloon","cable car","ferry","canoe","kayak","skateboard",
        "scooter","segway","monorail","space shuttle","parachute",
        # 음식
        "apple","banana","carrot","pizza","ice cream","cupcake","cake","bread",
        "orange","grape","strawberry","watermelon","lemon","cherry","pear",
        "peach","pineapple","corn","tomato","potato","egg","donut","cookie",
        "candy","hamburger","hotdog","sandwich","taco","popcorn","lollipop",
        "coffee","milk","cheese","sushi","ramen","dumpling","waffle","pancake",
        "croissant","pretzel","muffin","bagel","burrito","salad","soup","steak",
        "broccoli","avocado","mushroom","onion","garlic","pepper","cucumber",
        "pumpkin","coconut","mango","kiwi","blueberry","raspberry","melon",
        # 의류/패션
        "hat","cap","crown","glasses","ring","necklace","bracelet","shoe","boot",
        "sock","glove","scarf","tie","shirt","dress","jacket","coat","bag",
        "purse","belt","button","zipper","umbrella",
        # 스포츠용품
        "ball","trophy","medal","whistle","dumbbell","racket","bat","glove",
        "helmet","jersey","skate","ski","surfboard","dart","kite","fishing rod",
    ],
    "사회": [
        # 자연지형
        "mountain","volcano","island","river","lake","ocean","sea","desert",
        "forest","waterfall","cliff","canyon","glacier","cave","swamp","valley",
        "hill","beach","reef","geyser","dune","tundra","rainforest","savanna",
        # 건축/랜드마크
        "bridge","castle","tower","lighthouse","tent","pyramid","flag","compass",
        "globe","map","city","village","farm","harbor","dam","windmill","barn",
        "church","mosque","temple","stadium","museum","library","hospital",
        "school","skyscraper","factory","mine","oil rig","lighthouse",
        # 천문/기상
        "sun","moon","crescent","star","planet","saturn","comet","orbit","galaxy",
        "earth","satellite","asteroid","telescope","ufo","cloud","snowflake",
        "snow","lightning","rain","raindrop","wind","rainbow","tornado",
        "thermometer","storm","fog","aurora","meteor","black hole","nebula",
        # 사회/문화
        "crown","sword","shield","scroll","lantern","candle","campfire","bonfire",
        "tent","compass","anchor","wheel","hourglass","scales","gavel","trophy",
        "medal","ribbon","certificate","diploma","stamp","coin","gem","crystal",
    ],
    "과학": [
        "atom","molecule","test tube","beaker","flask","microscope","magnet",
        "battery","circuit","bulb","gear","lab","chemistry","physics","experiment",
        "rocket","telescope","satellite","dna","cell","virus","bacteria","enzyme",
        "crystal","prism","laser","magnet","compass","thermometer","barometer",
        "oscilloscope","centrifuge","bunsen burner","periodic table","electron",
        "proton","neutron","photon","quark","black hole","wormhole","supernova",
        "solar panel","wind turbine","nuclear","robot","drone","3d printer",
        "computer chip","circuit board","antenna","radar","sonar","x-ray","mri",
    ],
    "수학": [
        "abacus","calculator","protractor","compass","ruler","graph","chart",
        "bar chart","pie chart","number","plus","minus","equation","fraction",
        "infinity","angle","triangle","square","circle","cube","sphere","cylinder",
        "cone","pyramid","hexagon","pentagon","grid","coordinate","axis","vector",
        "matrix","integral","derivative","probability","statistics","set","venn diagram",
        "number line","parabola","sine wave","fibonacci","spiral","fractal",
    ],
    "도형": [
        "triangle","square","rectangle","pentagon","hexagon","octagon","circle",
        "oval","ellipse","star","parallelogram","trapezoid","rhombus","diamond",
        "cube","sphere","cylinder","cone","pyramid","heart","arrow","checkmark",
        "cross","spiral","crescent","polygon","torus","mobius strip","helix",
        "dodecahedron","tetrahedron","prism","arc","semicircle","quadrant",
    ],
    "음악": [
        "guitar","piano","drum","violin","trumpet","flute","saxophone","harp",
        "tambourine","xylophone","microphone","headphone","speaker","accordion",
        "cello","banjo","ukulele","bass","trombone","clarinet","oboe","tuba",
        "harmonica","lute","mandolin","sitar","didgeridoo","bagpipe","marimba",
        "vibraphone","music note","treble clef","bass clef","metronome",
        "vinyl record","cassette","cd","music stand","conductor baton",
    ],
    "체육": [
        "soccer ball","basketball","baseball","football","tennis","golf","bowling",
        "skateboard","ski","surfboard","medal","whistle","dumbbell","trophy",
        "hockey","volleyball","boxing glove","dart","kite","archery","fencing",
        "swimming","diving","gymnastics","cycling","rowing","weightlifting",
        "wrestling","judo","karate","taekwondo","badminton","ping pong","rugby",
        "cricket","lacrosse","polo","frisbee","javelin","discus","shot put",
        "hurdle","pole vault","high jump","long jump","marathon","triathlon",
        "snowboard","ice skate","bobsled","curling","biathlon","figure skating",
    ],
    "역사": [
        "sword","shield","helmet","armor","castle","catapult","cannon","bow arrow",
        "scroll","papyrus","hieroglyph","pyramid","sphinx","colosseum","parthenon",
        "samurai","knight","viking","pharaoh","emperor","crown","scepter","throne",
        "chariot","ship","compass","map","hourglass","lantern","torch","coin",
        "amphora","vase","column","arch","aqueduct","gladiator","centurion",
    ],
    "지리": [
        "globe","map","compass","flag","mountain","river","lake","ocean","desert",
        "forest","island","peninsula","continent","country","city","village",
        "border","latitude","longitude","equator","north pole","south pole",
        "timezone","elevation","valley","canyon","plateau","delta","estuary",
    ],
    "미술": [
        "palette","paintbrush","canvas","easel","sculpture","pottery","vase",
        "frame","gallery","museum","pencil","charcoal","watercolor","oil paint",
        "sketch","portrait","landscape","abstract","mosaic","fresco","graffiti",
        "origami","calligraphy","print","etching","lithograph","collage",
    ],
    "기호": [
        "heart","star","checkmark","cross","arrow","warning","info","question",
        "exclamation","plus","minus","equals","percent","at sign","hashtag",
        "copyright","trademark","registered","recycling","peace","yin yang",
        "infinity","anchor","crown","diamond","spade","club","shield","badge",
        "lock","key","bell","bookmark","tag","flag","pin","location","search",
        "home","settings","user","mail","phone","camera","music","video","image",
    ],
    "교통": [
        "car","bus","train","subway","tram","airplane","helicopter","rocket",
        "ship","boat","ferry","submarine","bicycle","motorcycle","scooter",
        "truck","ambulance","fire truck","police car","taxi","van","jeep",
        "hot air balloon","cable car","gondola","canoe","kayak","jet ski",
        "skateboard","segway","monorail","space shuttle","parachute","hang glider",
        "traffic light","road sign","highway","bridge","tunnel","airport","station",
    ],
}

# 중복 제거
for cat in topics:
    topics[cat] = list(dict.fromkeys(topics[cat]))

total = sum(len(v) for v in topics.values())
print(f"총 카테고리: {len(topics)}, 총 키워드: {total}")
for cat, words in topics.items():
    print(f"  {cat}: {len(words)}개")

with open('/home/ubuntu/auto-tactile/topics.json', 'w', encoding='utf-8') as f:
    json.dump(topics, f, ensure_ascii=False, indent=2)
print("저장 완료")
