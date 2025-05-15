# include <Siv3D.hpp> // Siv3D v0.6.16
# include "Multiplayer_Photon.hpp"
# include "PHOTON_APP_ID.SECRET"

/*
リアルタイム連続CCレモン

プレイヤーはタメ、攻撃、防御のいずれかの状態をとる

タメ:時間に応じてタメポイントがたまる
攻撃:タメポイントを消費して相手のhpを削る
防御:攻撃無効

相手のhpを削り切るか、タメポイントを一定量集めると打てる必殺技で勝利
*/


enum class PlayerState : uint8
{
	Charge, //タメ
	Attack, //攻撃
	Defense, //防御
};

struct PlayerData
{
	//プレイヤーのデータ
	PlayerState state = PlayerState::Charge;
	double hp = 100;
	double chargePoint = 0;
	PlayerData() = default;
	PlayerData(PlayerState state, double hp, double chargePoint)
		: state(state), hp(hp), chargePoint(chargePoint) {
	}
	PlayerData(double hp, double chargePoint)
		: hp(hp), chargePoint(chargePoint) {
	}
	template <class Archive>
	void SIV3D_SERIALIZE(Archive& archive)
	{
		archive(state, hp, chargePoint);
	}
};

enum class GameState : uint8
{
	//ゲームの状態
	Waiting, //待機中
	Playing, //プレイ中
	Finished, //終了
};

//複数プレイヤーで共有するデータ
class ShareGameData
{

public:
	std::array<PlayerData, 2> players;
	GameState gameState = GameState::Waiting;
	int32 wonPlayer = 0; //勝利したプレイヤーのインデックス。-1は未定義

	double maxHp = 100;
	double maxChargePoint = 200;

	ShareGameData() {}

	Optional<int32> updateGame(double dt) {
		int32 wonPlayer = 0;
		if (gameState != GameState::Playing) return none;

		auto pre_players = players;

		for (auto [i, player] : IndexedRef(players)) {
			if (player.state == PlayerState::Charge) {
				auto& enemy = players[1 - i];
				if (enemy.state != PlayerState::Attack) {
					player.chargePoint += 10 * dt; //タメポイントを増加
				}
			}
			else if (player.state == PlayerState::Attack) {
				if (player.chargePoint > 0) {
					double pre_cp = player.chargePoint;
					player.chargePoint -= 10 * dt; //タメポイントを減少
					player.chargePoint = Max(0.0, player.chargePoint); //タメポイントが0未満にならないようにする
					//攻撃処理
					//相手のhpを減少
					auto& enemy = players[1 - i];
					auto pre_enemy_has_charge = pre_players[1 - i].chargePoint > 0;
					if (enemy.state == PlayerState::Charge or (enemy.state == PlayerState::Attack and not pre_enemy_has_charge)) {
						enemy.hp -= (pre_cp - player.chargePoint) * 3;
					}
				}
			}
			else if (player.state == PlayerState::Defense) {
				//防御処理
			}
		}

		if (players[0].hp <= 0 || players[1].hp <= 0) {
			if (players[0].hp <= 0 and players[1].hp <= 0) {
				//同時ならより多くのhpが残っている方の勝利
				if (players[0].hp < players[1].hp) {
					wonPlayer = 1;
				}
				else {
					wonPlayer = 0;
				}
			}
			else if (players[0].hp <= 0) {
				//プレイヤー2の勝利
				wonPlayer = 1;
			}
			else {
				//プレイヤー1の勝利
				wonPlayer = 0;
			}

			for (auto& player : players) {
				player.hp = Max(0.0, player.hp);
				player.chargePoint = Min(maxChargePoint, player.chargePoint);
			}

			return wonPlayer;
		}
		else if (players[0].chargePoint >= maxChargePoint || players[1].chargePoint >= maxChargePoint) {
			if (players[0].chargePoint >= maxChargePoint and players[1].chargePoint >= maxChargePoint) {
				//同時ならより多くたまっている方の勝利
				if (players[0].chargePoint > players[1].chargePoint) {
					wonPlayer = 0;
				}
				else {
					wonPlayer = 1;
				}
			}
			else if (players[0].chargePoint >= maxChargePoint) {
				//プレイヤー1の勝利
				wonPlayer = 0;
			}
			else {
				//プレイヤー2の勝利
				wonPlayer = 1;
			}

			for (auto& player : players) {
				player.hp = Max(0.0, player.hp);
				player.chargePoint = Min(maxChargePoint, player.chargePoint);
			}

			return wonPlayer;
		}
		return none;
	}

	template <class Archive>
	void SIV3D_SERIALIZE(Archive& archive)
	{
		archive(players, gameState, wonPlayer);
	}
};

namespace EventCode {
	enum : uint8
	{
		//イベントコードは1から199までの範囲を使う
		sendShareGameData = 1,
		startGame,
		changePlayerState,
		finishGame,

	};
}

class MyClient : public Multiplayer_Photon
{
public:
	MyClient()
	{
		init(std::string(SIV3D_OBFUSCATE(PHOTON_APP_ID)), U"1.0", Verbose::No);

		RegisterEventCallback(EventCode::sendShareGameData, &MyClient::eventReceived_sendShareGameData);
		RegisterEventCallback(EventCode::startGame, &MyClient::eventReceived_startGame);
		RegisterEventCallback(EventCode::changePlayerState, &MyClient::eventReceived_changePlayerState);
		RegisterEventCallback(EventCode::finishGame, &MyClient::eventReceived_finishGame);
	}

	Optional<ShareGameData> shareGameData;

	int32 myPlayerIndex = 0;

	String enemyPlayerName;

	Timer timer{ 3s };

	void startGame(double maxHp, double maxChargePoint)
	{
		//ゲーム開始
		if (not shareGameData) return;
		shareGameData->maxHp = maxHp;
		shareGameData->maxChargePoint = maxChargePoint;
		sendEvent({ EventCode::startGame ,ReceiverOption::All }, maxHp, maxChargePoint);
	}

	void changeState(PlayerState state)
	{
		//状態を変更する
		if (not shareGameData) return;
		sendEvent({ EventCode::changePlayerState, ReceiverOption::All }, myPlayerIndex, state);
	}

	void finishGame(int32 wonPlayer)
	{
		//ゲーム終了
		if (not shareGameData) return;
		sendEvent({ EventCode::finishGame ,ReceiverOption::All }, wonPlayer);
	}

private:

	//イベントを受信したらそれに応じた処理を行う

	void eventReceived_sendShareGameData([[maybe_unused]] LocalPlayerID playerID, const ShareGameData& data)
	{
		shareGameData = data;
	}

	void eventReceived_startGame([[maybe_unused]] LocalPlayerID playerID, double maxHp, double maxChargePoint)
	{
		if (not shareGameData) return;
		shareGameData->maxHp = maxHp;
		shareGameData->maxChargePoint = maxChargePoint;
		shareGameData->gameState = GameState::Playing;
		shareGameData->players = { PlayerData(maxHp, 0), PlayerData(maxHp, 0) };
		if (playerID == getLocalPlayerID()) {
			myPlayerIndex = 0;
		}
		else {
			myPlayerIndex = 1;
		}
		timer.restart();
	}

	void eventReceived_changePlayerState([[maybe_unused]] LocalPlayerID playerID, int32 playerIndex, PlayerState state)
	{
		if (not shareGameData) return;
		shareGameData->players[playerIndex].state = state;
	}

	void eventReceived_finishGame([[maybe_unused]] LocalPlayerID playerID, int32 wonPlayer)
	{
		if (not shareGameData) return;
		shareGameData->wonPlayer = wonPlayer;
		shareGameData->gameState = GameState::Finished;
	}


	void joinRoomEventAction(const LocalPlayer& newPlayer, [[maybe_unused]] const Array<LocalPlayerID>& playerIDs, bool isSelf) override
	{
		//自分が部屋に入った時
		if (isSelf) {
			shareGameData.reset();
		}

		//ホストが入室した時、つまり部屋を新規作成した時
		if (isSelf and isHost()) {
			shareGameData = ShareGameData();
		}

		//誰かが部屋に入って来た時、ホストはその人にデータを送る
		if (not isSelf and isHost()) {
			sendEvent({ EventCode::sendShareGameData, { newPlayer.localID } }, *shareGameData);
		}
	}
};

void Main()
{
	MyClient client;

	Font font(30);

	Window::Resize(500, 800);

	TextEditState playerNameEditState{ U"通りすがりの勇者" };

	RectF enemyHpBarRect(Arg::bottomCenter(250, 300), 350, 30);

	Circle enemyStateCircle(250, 150, 80);

	RectF hpBarRect(Arg::bottomCenter(250, 500), 450, 30);
	RectF attackButton(250, 500, 250, 250);
	RectF defenseButton(250 - 250, 500, 250, 250);
	Circle chargeCircle(250, 670, 100);

	double timeAccum = 0;
	constexpr double timeStep = 1.0 / 60;

	Texture backSpaceIcon(0xF55a_icon, 20);

	double setting_maxHp = 100;
	double setting_maxChargePoint = 200;

	Texture swordIcon(0xF04E5_icon, 100);
	Texture shieldIcon(0xF0499_icon, 100);
	Texture chargeIcon(0xF00E8_icon, 100);

	while (System::Update())
	{

		if (client.isActive())
		{
			client.update();
		}
		else {
			client.connect(U"player", U"jp");
		}

		if (client.isInLobby())
		{
			Scene::Rect().draw(Palette::Steelblue);

			font(U"Name:").drawAt(Scene::CenterF().moveBy(-150, -100), Palette::White);
			SimpleGUI::TextBoxAt(playerNameEditState, Scene::CenterF().moveBy(0, -100));

			RoundRect backSpaceButton(Arg::center(Scene::CenterF().moveBy(130, -100)), 50, 30, 5);
			backSpaceButton.draw(backSpaceButton.leftPressed() ? ColorF(0.9) : ColorF(1));
			backSpaceButton.drawFrame(2, Palette::Gray);
			backSpaceIcon.drawAt(backSpaceButton.center(), Palette::Lightsteelblue);

			if (backSpaceButton.leftClicked()) {
				if (not playerNameEditState.text.isEmpty()) {
					playerNameEditState.text.pop_back();
				}
			}


			if (SimpleGUI::ButtonAt(U"ランダムマッチ", Scene::Center(), 300))
			{
				//適当な部屋に入るか、部屋がなければ新規作成する。空文字列を指定するとランダムな部屋名になる。
				client.joinRandomOrCreateRoom(U"", RoomCreateOption().maxPlayers(2));
			}


		}

		if (client.isInRoom())
		{
			Scene::Rect().draw(Palette::Sienna);

			if (client.shareGameData) {
				if (client.shareGameData->gameState == GameState::Playing) {
					//プレイ中

					const auto& player = client.shareGameData->players[client.myPlayerIndex];
					const auto& enemy = client.shareGameData->players[1 - client.myPlayerIndex];

					for (timeAccum += Scene::DeltaTime(); timeAccum >= timeStep; timeAccum -= timeStep) {
						auto result = client.shareGameData->updateGame(timeStep);

						if (result and client.isHost()) {
							client.finishGame(result.value());
						}
					}

					if (client.timer.reachedZero()) {
						PlayerState changeState = PlayerState::Charge;
						if (MouseL.pressed()) {
							if (attackButton.mouseOver()) {
								changeState = PlayerState::Attack;
							}
							else if (defenseButton.mouseOver()) {
								changeState = PlayerState::Defense;
							}
						}

						if (changeState != player.state) {
							client.changeState(changeState);
						}
					}


					//draw
					enemyStateCircle.stretched(10).draw(Palette::Black);
					enemyStateCircle.drawArc(0, enemy.chargePoint / client.shareGameData->maxChargePoint * Math::TwoPi, 0, 10, Palette::Orange);

					if (enemy.state == PlayerState::Charge) {
						enemyStateCircle.draw(Palette::Green);
						chargeIcon.drawAt(enemyStateCircle.center, Palette::White);
					}
					else if (enemy.state == PlayerState::Attack) {
						enemyStateCircle.draw(Palette::Red);
						swordIcon.drawAt(enemyStateCircle.center, Palette::White);
					}
					else if (enemy.state == PlayerState::Defense) {
						enemyStateCircle.draw(Palette::Blue);
						shieldIcon.drawAt(enemyStateCircle.center, Palette::White);
					}

					enemyHpBarRect.draw(Palette::Black);
					RectF enemyHpBarRect2(enemyHpBarRect.pos, enemyHpBarRect.w * (enemy.hp / client.shareGameData->maxHp), enemyHpBarRect.h);
					enemyHpBarRect2.draw(Palette::Lime);

					attackButton.draw(Palette::Red);
					swordIcon.drawAt(attackButton.center() + Vec2(50, 0), Palette::White);
					if (player.state == PlayerState::Attack) {
						attackButton.draw(ColorF(1, 0.5));
					}
					defenseButton.draw(Palette::Blue);
					shieldIcon.drawAt(defenseButton.center() - Vec2(50, 0), Palette::White);
					if (player.state == PlayerState::Defense) {
						defenseButton.draw(ColorF(1, 0.5));
					}
					chargeCircle.stretched(10).draw(Palette::Black);
					chargeCircle.draw(Palette::Green);
					chargeIcon.drawAt(chargeCircle.center, Palette::White);
					if (player.state == PlayerState::Charge) {
						chargeCircle.draw(ColorF(1, 0.5));
					}
					chargeCircle.drawArc(0, player.chargePoint / client.shareGameData->maxChargePoint * Math::TwoPi, 0, 10, Palette::Orange);
					hpBarRect.draw(Palette::Black);
					RectF hpBarRect2(hpBarRect.pos, hpBarRect.w * (player.hp / client.shareGameData->maxHp), hpBarRect.h);
					hpBarRect2.draw(Palette::Lime);


					if (not client.timer.reachedZero()) {
						Scene::Rect().draw(ColorF(0, 0.5));
						font(U"スタートまで…{}"_fmt(client.timer.s_ceil())).drawAt(Scene::CenterF(), Palette::White);
					}
				}
				else if (client.shareGameData->gameState == GameState::Finished) {
					//終了
					font(U"GameState: Finished").drawAt(Scene::CenterF().moveBy(0, -100), Palette::White);
					if (client.shareGameData->wonPlayer == client.myPlayerIndex) {
						font(U"You Win!").drawAt(Scene::CenterF().moveBy(0, 0), Palette::White);
					}
					else {
						font(U"You Lose...").drawAt(Scene::CenterF().moveBy(0, 0), Palette::White);
					}
					if (SimpleGUI::ButtonAt(U"Restart", Scene::CenterF().moveBy(0, 200), 300)) {
						//ゲーム再開
						client.shareGameData->gameState = GameState::Waiting;
					}
				}
				else if (client.shareGameData->gameState == GameState::Waiting)
				{
					//待機中
					if (client.isHost()) {
						SimpleGUI::SliderAt(U"MaxHp:{}"_fmt(Floor(setting_maxHp / 10) * 10), setting_maxHp, 50, 1000, Scene::CenterF().moveBy(0, -300), 120, 240);
						SimpleGUI::SliderAt(U"ChargeLimit:{}"_fmt(Floor(setting_maxChargePoint / 10) * 10), setting_maxChargePoint, 50, 1000, Scene::CenterF().moveBy(0, -200), 180, 240);



						if (SimpleGUI::ButtonAt(U"Start", Scene::CenterF().moveBy(0, 100), 300, client.getPlayerCountInCurrentRoom() == 2)) {
							//ゲーム開始
							if (client.getPlayerCountInCurrentRoom() == 2) {
								client.startGame(Floor(setting_maxHp / 10) * 10, Floor(setting_maxChargePoint / 10) * 10);
							}
						}
					}

					font(U"player count: {} / 2"_fmt(client.getPlayerCountInCurrentRoom())).drawAt(Scene::CenterF().moveBy(0, 0), Palette::White);

				}
			}
			if (not client.shareGameData or (client.shareGameData and client.shareGameData->gameState == GameState::Playing)) {
				if (SimpleGUI::Button(U"LeaveRoom", Vec2{ 20, 20 }, 160))
				{
					client.leaveRoom();
				}
			}
		}

		if (not (client.isDisconnected() or client.isInLobby() or client.isInRoom())) {
			//ローディング画面
			int32 t = static_cast<int32>(Floor(fmod(Scene::Time() / 0.1, 8)));
			for (int32 i : step(8)) {
				Vec2 n = Circular(1, i * Math::TwoPi / 8);
				Line(Scene::Center() + n * 10, Arg::direction(n * 10)).draw(LineStyle::RoundCap, 4, t == i ? ColorF(1, 0.9) : ColorF(1, 0.5));
			}
		}
	}
}

